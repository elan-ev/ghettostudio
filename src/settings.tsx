import React, { useEffect, useState } from "react";
import deepmerge from "deepmerge";
import parseToml from "@iarna/toml/parse-string";
import { unreachable } from "@opencast/appkit";

import { decodeHexString, usePresentContext } from "./util";
import { DEFINES } from "./defines";

const LOCAL_STORAGE_KEY = "ocStudioSettings";
const CONTEXT_SETTINGS_FILE = "settings.toml";
const QUERY_PARAM_SETTINGS_PATH = "settingsFile";

export const FORM_FIELD_HIDDEN = "hidden";
export const FORM_FIELD_OPTIONAL = "optional";
export const FORM_FIELD_REQUIRED = "required";
export type FormFieldState =
  | typeof FORM_FIELD_HIDDEN
  | typeof FORM_FIELD_OPTIONAL
  | typeof FORM_FIELD_REQUIRED;

/** Sources that setting values can come from. */
type SettingsSource = "src-server"| "src-url" | "src-local-storage";

const PRESENTER_SOURCES = ["opencast"] as const;
type PresenterSource = typeof PRESENTER_SOURCES[number];

/** Opencast Studio runtime settings. */
export type Settings = {
  opencast?: {
    serverUrl?: string; // TODO: make this URL
    loginName?: string;
    loginPassword?: string;
    loginProvided?: boolean;
  };
  upload?: {
    seriesId?: string;
    workflowId?: string;
    acl?: boolean | string;
    dcc?: string;
    titleField?: FormFieldState;
    presenterField?: FormFieldState;
    seriesField?: FormFieldState;
    autofillPresenter?: PresenterSource[];
  };
  recording?: {
    videoBitrate?: number;
    mimes?: string[];
  };
  review?: {
    disableCutting?: boolean;
  };
  display?: {
    maxFps?: number;
    maxHeight?: number;
  };
  camera?: {
    maxFps?: number;
    maxHeight?: number;
  };
  return?: {
    allowedDomains?: string[];
    label?: string;
    target?: string;
  };
};

/**
 * The values prefilled on the settings page. These settings are *not* used
 * automatically, they are just the defaults for the UI.
 */
const defaultSettings: Settings = {
  opencast: {
    serverUrl: "https://develop.opencast.org/",
    loginName: "admin",
    loginPassword: "opencast",
  },
};


// ==============================================================================================
// ===== SettingsManager
// ==============================================================================================

/**
 * Responsible for obtaining settings from different places (context settings,
 * local storage, query parameter) and merging them appropriately.
 */
export class SettingsManager {
  /**
   * The settings set by the server. These cannot be edited by the user. If the
   * server did not specify any settings, this is `{}`.
   */
  contextSettings: Settings = Object.create(null);

  /**
   * These settings are given in the query part of the URL (e.g.
   * `?opencast.loginName=peter`). If there are no settings in the URL, this
   * is `{}`.
   */
  urlSettings: Settings = Object.create(null);

  /**
   * The settings set by the user and stored in local storage. This is `{}` if
   * there were no settings in local storage.
   */
  #userSettings: Settings = Object.create(null);

  /**
   * This function is called whenever the user saved their settings. The new
   * settings object is passed as parameter.
   */
  onChange: (newSettings: Settings) => void = () => {
    // By default, this does nothing. It is overwritten below.
  };

  /**
   * Creates a new `Settings` instance by loading user settings from local
   * storage and attempting to load context settings from the server..
   */
  static async init() {
    const self = new SettingsManager();

    // Load the user settings from local storage
    const stored = window.localStorage.getItem(LOCAL_STORAGE_KEY);
    if (stored !== null) {
      let rawUserSettings;
      try {
        rawUserSettings = JSON.parse(stored);
      } catch {
        console.warn("Could not parse settings stored in local storage. Ignoring.");
      }
      self.#userSettings = validate(
        rawUserSettings,
        false,
        "src-local-storage",
        "from local storage user settings",
      );
    }

    const rawContextSettings = await SettingsManager.loadContextSettings() || Object.create(null);
    self.contextSettings = validate(
      rawContextSettings,
      false,
      "src-server",
      "from server settings file",
    );

    // Get settings from URL query. We remove the key `settingsFile` as that is
    // just used for loading the context settings.
    const urlParams = new URLSearchParams(window.location.search);
    urlParams.delete(QUERY_PARAM_SETTINGS_PATH);

    const encodedConfig = urlParams.get("config");
    if (encodedConfig) {
      // In this case, the GET parameter `config` is specified. We now expect a
      // hex encoded TOML file describing the configuration. This is possible in
      // cases where special characters in GET parameters might get modified
      // somehow (e.g. by an LMS). A config=hexstring only uses the most basic
      // characters, so it should always work.

      const decodeAndParse = (input: string): Record<string, unknown> | null => {
        let decoded: string;
        try {
          decoded = decodeHexString(input);
        } catch (e) {
          console.warn(
            "Could not decode hex-encoded string given to GET parameter 'config'. Ignoring. Error:",
            e,
          );
          return null;
        }

        try {
          return parseToml(decoded);
        } catch (e) {
          console.warn(
            "Could not parse (as TOML) decoded hex-string given to GET parameter 'config'. "
              + "Ignoring. Error:",
            e,
          );
        }
        return null;
      };

      for (const key of urlParams.keys()) {
        if (key !== "config") {
          console.warn(
            `URL GET parameter '${key}' is ignored as 'config' is specified. Either specify `
            + " all configuration via the 'config' GET parameter hex string or via direct GET "
            + "parameters. Mixing is not allowed."
          );
        }
      }

      const rawUrlSettings = decodeAndParse(encodedConfig);
      self.urlSettings = validate(
        rawUrlSettings ?? {},
        false,
        "src-url",
        "given as URL `config` GET parameter",
      );
    } else {
      // Interpret each get parameter as single configuration value.
      const rawUrlSettings = Object.create(null);
      for (const [key, value] of urlParams) {
        // Create empty objects for full path (if the key contains '.') and set
        // the value at the end.
        let obj = rawUrlSettings;
        const segments = key.split(".");
        segments.slice(0, -1).forEach(segment => {
          if (!(segment in obj)) {
            obj[segment] = Object.create(null);
          }
          obj = obj[segment];
        });
        obj[segments[segments.length - 1]] = value;
      }

      self.urlSettings = validate(rawUrlSettings, true, "src-url", "given as URL GET parameter");
    }

    return self;
  }

  /**
   * Attempts to load `settings.toml` (or SETTINGS_PATH if that's specified)
   * from the server. If it fails for some reason, returns `null` and prints an
   * appropriate message on console.
   */
  static async loadContextSettings() {
    // Construct path to settings file. If the `SETTINGS_PATH` is given and
    // starts with '/', it is interpreted as absolute path from the server
    // root.
    let settingsPath = DEFINES.settingsPath || CONTEXT_SETTINGS_FILE;

    // If a custom file is given via query parameter, change the settings path
    // appropriately.
    const urlParams = new URLSearchParams(window.location.search);
    const customFile = urlParams.get(QUERY_PARAM_SETTINGS_PATH);
    if (customFile) {
      if (customFile.includes("/") || customFile.includes("\\")) {
        console.warn(`You can only specify a filename via '${QUERY_PARAM_SETTINGS_PATH}', `
          + "not a path");
      } else {
        const segments = settingsPath.split("/");
        segments[segments.length - 1] = customFile;
        settingsPath = segments.join("/");
      }
    }

    const base = settingsPath.startsWith("/") ? "" : DEFINES.publicPath;
    const url = `${window.location.origin}${base}${settingsPath}`;
    let response: Response;
    try {
      response = await fetch(url);
    } catch (e) {
      console.warn(`Could not access '${settingsPath}' due to network error!`, e || "");
      return null;
    }

    if (response.status === 404) {
      // If the settings file was not found, we silently ignore the error. We
      // expect many installation to provide this file.
      console.debug(`'${settingsPath}' returned 404: ignoring`);
      return null;
    } else if (!response.ok) {
      console.error(
        `Fetching '${settingsPath}' failed: ${response.status} ${response.statusText}`
      );
      return null;
    }

    if (response.headers.get("Content-Type")?.startsWith("text/html")) {
      console.warn(`'${settingsPath}' request has 'Content-Type: text/html' -> ignoring...`);
      return null;
    }

    try {
      return parseToml(await response.text());
    } catch (e) {
      console.error(`Could not parse '${settingsPath}' as TOML: `, e);
      throw new SyntaxError(`Could not parse '${settingsPath}' as TOML: ${e}`);
    }
  }

  /**
   * Stores the given `newSettings` as user settings. The given object might be
   * partial, i.e. only the new values can be specified. Values in `newSettings`
   * override values in the old user settings.
   */
  saveSettings(newSettings: Settings) {
    this.#userSettings = merge(this.#userSettings, newSettings);
    window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(this.#userSettings));
    this.onChange(this.settings());
  }

  /** The merged settings that the whole application should use. */
  settings(): Settings {
    return mergeAll([this.#userSettings, this.contextSettings, this.urlSettings]);
  }

  /**
   * The values for the settings forms. These are simply the user settings with
   * missing settings filled by `defaultSettings`.
   */
  formValues() {
    return merge(defaultSettings, this.#userSettings);
  }

  fixedSettings(): Settings {
    return merge(this.contextSettings, this.urlSettings);
  }

  /**
   * Returns whether a specific setting is configurable by the user. It is not
   * if the setting is fixed by the context setting or an URL setting. The path
   * is given as string. Example: `manager.isConfigurable('opencast.loginName')`
   */
  isConfigurable(path: string) {
    let obj = this.fixedSettings();
    const segments = path.split(".");
    for (const segment of segments) {
      if (!(segment in obj)) {
        return true;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      obj = (obj as any)[segment];
    }

    return false;
  }

  isUsernameConfigurable() {
    return this.isConfigurable("opencast.loginName")
      && this.fixedSettings().opencast?.loginProvided !== true;
  }
  isPasswordConfigurable() {
    return this.isConfigurable("opencast.loginPassword")
      && this.fixedSettings().opencast?.loginProvided !== true;
  }
}



// ==============================================================================================
// ===== Setting runtime validation
// ==============================================================================================

/**
 * Validate the given `obj` with the global settings `SCHEMA`. If `allowParse`
 * is true, string values are attempted to parse into the expected type. `src`
 * must be one of `SRC_SERVER`, `SRC_URL` or `SRC_LOCAL_STORAGE`.
 * `srcDescription` is just a string for error messages specifying where `obj`
 * comes from.
 */
const validate = (
  obj: object,
  allowParse: boolean,
  src: SettingsSource,
  sourceDescription: string,
): Settings => {
  type SchemaOrValidator = Validator<unknown> | { [key: string]: SchemaOrValidator };

  // Validates `obj` with `schema`. `path` is the current path used for error
  // messages.
  const validate = (schema: SchemaOrValidator, obj: unknown, path: string) => {
    if (typeof schema === "function") {
      return validateValue(schema, obj, path);
    } else if (obj && typeof obj === "object") {
      return validateObj(schema, obj, path);
    } else {
      return unreachable();
    }
  };

  // Validate a settings value with a validation function. Returns the final
  // value of the setting or `null` if it should be ignored.
  const validateValue = (validation: Validator<unknown>, value: unknown, path: string) => {
    try {
      const newValue = validation(value, allowParse, src);
      return newValue === undefined ? value : newValue;
    } catch (e) {
      throw new Error(
        `Validation of setting '${path}' (${sourceDescription}) with value '${value}' failed: `
        + `${e}.`
      );
    }
  };

  // Validate a settings object/namespace. `schema` and `obj` need to be
  // objects.
  const validateObj = (schema: Record<string, SchemaOrValidator>, obj: object, path: string) => {
    // We iterate through all keys of the given settings object, checking if
    // each key is valid and recursively validating the value of that key.
    const out = Object.create(null);
    for (const [key, value] of Object.entries(obj)) {
      const newPath = path ? `${path}.${key}` : key;
      if (key in schema && key in obj) {
        const validatedValue = validate(schema[key], value, newPath);

        // If `null` is returned, the validation failed and we ignore this
        // value.
        if (validatedValue !== null) {
          out[key] = validatedValue;
        }
      } else {
        throw new Error(
          `'${newPath}' (${sourceDescription}) is not a valid settings key.`
        );
      }
    }

    return out;
  };

  return validate(SCHEMA, obj, "");
};

/**
 * Validation function for a setting value.
 *
 * `v` is the input value and could be anything. `allowParse` specifies whether
 * the input might be parsed into the correct type (this is only `true` for GET
 * parameters). The validation should throw an error if the input value is not
 * valid for the setting. Otherwise the function must return a value which is
 * then used in the validated settings object. The returned value might be `v`
 * or something else.
 */
type Validator<T> = (v: unknown, allowParse: boolean, src: SettingsSource) => T;

/** Validation functions for basic types. */
const types = {
  "string": v => {
    if (typeof v !== "string") {
      throw new Error("is not a string, but should be");
    }
    return v;
  },
  "int": (v, allowParse): number => {
    if (Number.isInteger(v)) {
      return v as number;
    }

    if (allowParse && typeof v === "string") {
      if (/^[-+]?(\d+)$/.test(v)) {
        return Number(v);
      }

      throw new Error("can't be parsed as integer");
    } else {
      throw new Error("is not an integer");
    }
  },
  "boolean": (v, allowParse): boolean => {
    if (typeof v === "boolean") {
      return v;
    }

    if (allowParse) {
      if (v === "true") {
        return true;
      }
      if (v === "false") {
        return false;
      }
      throw new Error("can't be parsed as boolean");
    } else {
      throw new Error("is not a boolean");
    }
  },
  positiveInteger: (v, allowParse): number => {
    const i = types.int(v, allowParse);
    if (i <= 0) {
      throw new Error("has to be positive, but isn't");
    }

    return i;
  },
  "array": elementType => {
    return (v, allowParse, src) => {
      if (typeof v === "string" && allowParse) {
        try {
          v = JSON.parse(v);
        } catch {
          throw new Error("can't be parsed as array");
        }
      }

      if (!Array.isArray(v)) {
        throw new Error("is not an array");
      }

      return v.map(element => {
        try {
          return elementType(element, allowParse, src);
        } catch (err) {
          throw new Error(`failed to validate element '${element}' of array: ${err}`);
        }
      });
    };
  },
} satisfies {
  string: Validator<string>;
  int: Validator<number>;
  boolean: Validator<boolean>;
  positiveInteger: Validator<number>;
  array: <T, >(validator: Validator<T>) => Validator<T[]>;
};

/** Validator for `FormFieldState`. */
const metaDataField: Validator<FormFieldState> = v => {
  if (typeof v !== "string") {
    throw new Error("has to be a string");
  }

  if (![FORM_FIELD_HIDDEN, FORM_FIELD_OPTIONAL, FORM_FIELD_REQUIRED].includes(v)) {
    throw new Error(
      `has to be either '${FORM_FIELD_HIDDEN}', '${FORM_FIELD_OPTIONAL}' or `
        + `'${FORM_FIELD_REQUIRED}', but is '${v}'`
    );
  }

  return v as FormFieldState;
};

/**
 * A validator wrapper that errors of the source of the value is NOT
 * `settings.toml`.
 */
const onlyFromServer = <Out, >(inner: Validator<Out>): Validator<Out> => (
  (v, allowParse, src) => {
    if (src !== "src-server") {
      throw new Error("this configuration cannot be specified via the URL or local storage, "
        + "but must be specified in 'settings.toml'");
    }

    return inner(v, allowParse, src);
  }
);

/** Defines all potential settings and their validation functions. */
const SCHEMA = {
  opencast: {
    serverUrl: v => {
      const s = types.string(v);

      if (s === "/" || s === "") {
        return;
      }

      const url = new URL(s);
      if (url.protocol !== "https:" && url.protocol !== "http:") {
        throw new Error('the URL does not start with "http:" or "https:"');
      }

      // TODO: we could return the `URL` here or do other adjustments
      return v;
    },
    loginName: types.string,
    loginPassword: types.string,
    loginProvided: types.boolean,
  },
  upload: {
    seriesId: types.string,
    workflowId: types.string,
    acl: (v, allowParse) => {
      if ((allowParse && v === "false") || v === false) {
        return false;
      }
      if ((allowParse && v === "true") || v === true) {
        return true;
      }

      if (typeof v === "string" && v.trim().startsWith("<")) {
        return v;
      }

      throw new Error("needs to be 'true', 'false' or an XML string");
    },
    dcc: types.string,
    titleField: metaDataField,
    presenterField: metaDataField,
    seriesField: metaDataField,
    autofillPresenter: (v, allowParse, src) => {
      const a = types.array(v => {
        const s = types.string(v);
        if (!(PRESENTER_SOURCES as readonly string[]).includes(s)) {
          throw new Error("invalid presenter name source");
        }
        return s;
      })(v, allowParse, src);
      if (new Set(a).size < a.length) {
        throw new Error("duplicate presenter name source");
      }
      return a;
    },
  },
  recording: {
    videoBitrate: types.positiveInteger,
    mimes: types.array(types.string),
  },
  review: {
    disableCutting: types.boolean,
  },
  display: {
    maxFps: types.positiveInteger,
    maxHeight: types.positiveInteger,
  },
  camera: {
    maxFps: types.positiveInteger,
    maxHeight: types.positiveInteger,
  },
  return: {
    allowedDomains: onlyFromServer(types.array(types.string)),
    label: types.string,
    target: v => {
      if (typeof v !== "string") {
        throw new Error("has to be a string");
      }
      if (!(v.startsWith("/") || v.startsWith("http"))) {
        throw new Error("has to start with '/' or 'http'");
      }
      return v;
    },
  },
} satisfies Record<string, Record<string, Validator<unknown>>>;


// ==============================================================================================
// ===== Utilities
// ==============================================================================================

// Customize array merge behavior
const merge = (a: Settings, b: Settings): Settings => deepmerge(a, b, { arrayMerge });
const mergeAll = (array: Settings[]) => deepmerge.all(array, { arrayMerge });
const arrayMerge: deepmerge.Options["arrayMerge"]
  = (_destinationArray, sourceArray, _options) => sourceArray;


// ==============================================================================================
// ===== React context for settings
// ==============================================================================================

const Context = React.createContext<Settings | null>(null);
const ManagerContext = React.createContext<SettingsManager | null>(null);

/** Returns the current settings. */
export const useSettings = (): Settings => usePresentContext(Context, "useSettings");

/** Returns the settings manager. */
export const useSettingsManager = (): SettingsManager =>
  usePresentContext(ManagerContext, "useSettingsManager");

type ProviderProps = React.PropsWithChildren<{
  settingsManager: SettingsManager;
}>;

export const Provider: React.FC<ProviderProps> = ({ settingsManager, children }) => {
  const [settings, updateSettings] = useState<Settings>(settingsManager.settings());
  settingsManager.onChange = (newSettings: Settings) => updateSettings(newSettings);

  // This debug output will be useful for future debugging sessions.
  useEffect(() => {
    console.debug("Current settings: ", settings);
  });

  return (
    <ManagerContext.Provider value={settingsManager}>
      <Context.Provider value={settings}>
        {children}
      </Context.Provider>
    </ManagerContext.Provider>
  );
};
