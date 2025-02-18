import React, { useEffect, useState } from "react";
import equal from "fast-deep-equal";
import Mustache from "mustache";
import { bug } from "@opencast/appkit";

import { recordingFileName, usePresentContext } from "./util";
import { Settings } from "./settings";
import { Recording } from "./studio-state";


/** The server URL was not specified. */
export const STATE_UNCONFIGURED = "unconfigured";

/**
 * The OC server is reachable but a login was not attempted and the current user
 * is anonymous.
 */
export const STATE_CONNECTED = "connected";

/** The OC server is reachable and the user is authenticated. */
export const STATE_LOGGED_IN = "logged_in";

/** Some network error occured when accessing the server. */
export const STATE_NETWORK_ERROR = "network_error";

/**
 * When accessing the OC API, the request returned as non-2xx code unexpectedly.
 * This likely indicates that the server is not actually a valid OC server.
 */
export const STATE_RESPONSE_NOT_OK = "response_not_ok";

/** The API requested returned invalid JSON or unexpected data. */
export const STATE_INVALID_RESPONSE = "invalid_response";

/**
 * The server is reachable and a login was provided, but the login did not
 * succeed.
 */
export const STATE_INCORRECT_LOGIN = "incorrect_login";

type OpencastState =
  | typeof STATE_UNCONFIGURED
  | typeof STATE_CONNECTED
  | typeof STATE_LOGGED_IN
  | typeof STATE_NETWORK_ERROR
  | typeof STATE_RESPONSE_NOT_OK
  | typeof STATE_INVALID_RESPONSE
  | typeof STATE_INCORRECT_LOGIN;

type UploadState =
  | "success"
  | "network_error"
  | "not_authorized"
  | "unexpected_response"
  | "unknown_error";


export class Opencast {
  #state: OpencastState = STATE_UNCONFIGURED;
  #serverUrl: string | null = null;

  /**
   * This can one of either:
   * - `null`: no login is provided and login data is not specified
   * - `true`: a login is already automatically provided from the OC context
   * - `{ username, password }`: username and password are given
   */
  #login: null | true | { username: string; password: string } = null;

  /**
   * The response of `/info/me.json` or `null` if requesting that API did not
   * succeed.
   */
  #currentUser: unknown = null;

  /**
   * The response from `/lti` or `null` if the request failed for some reason or
   * if `this.#login !== true`. Note though, that this can also be the empty
   * object, indicating that there is no LTI session.
   */
  #ltiSession: unknown = null;

  updateGlobalOc: null | ((oc: Opencast) => void) = null;


  constructor(settings: Settings["opencast"]) {
    // If the server URL is not given, we stay in unconfigured state and
    // immediately return.
    if (settings?.serverUrl == null) {
      return;
    }

    this.#serverUrl = settings.serverUrl.endsWith("/")
      ? settings.serverUrl.slice(0, -1)
      : settings.serverUrl;

    if (settings.loginProvided === true) {
      // Here we can assume Studio is running within an Opencast instance and
      // the route to Studio is protected via login. This means that login
      // cookies are already present and we don't need to worry about that.
      this.#login = true;
    } else if (settings.loginName && settings.loginPassword) {
      // Studio is not running in OC context, but username and password are
      // provided.
      this.#login = {
        username: settings.loginName,
        password: settings.loginPassword,
      };
    } else {
      // Login is not yet provided.
      this.#login = null;
    }
  }

  /** Creates a new instance from the settings and calls `updateUser` on it. */
  static async init(settings: Settings["opencast"]) {
    const self = new Opencast(settings);
    await self.updateUser();
    return self;
  }

  /**
   * Requests series from Opencast that the current user has write access to.
   * Returns a map from series ID to title, or "error" if anything goes wrong.
   */
  async getSeries(): Promise<Map<string, string>> {
    if (this.#serverUrl === null) {
      throw new Error("Connection not configured");
    }

    const series = await this.jsonRequest("studio-api/series.json");

    const isProperForm = (obj: object | null): obj is { id: string; title: string }[] => (
      Array.isArray(obj) && obj.every(s => typeof s === "object"
        && "id" in s
        && "title" in s
        && typeof s.id === "string"
        && typeof s.title === "string",
      )
    );
    if (!isProperForm(series)) {
      throw new InvalidJson("unexpected result from series API", null);
    }

    return new Map(series.map(s => [s.id, s.title]));
  }

  /** Updates the global OC instance from `this` to `newInstance`. */
  setGlobalInstance(newInstance: Opencast) {
    if (!this.updateGlobalOc) {
      bug("'updateGlobalOc' not set");
    }

    this.updateGlobalOc?.(newInstance);
  }

  /**
   * Refreshes the connection by requesting `info/me` unless the state is
   * 'unconfigured'.
   *
   * If the request errors or returns a different user, the global Opencast
   * instance is updated.
   */
  async refreshConnection() {
    if (this.#serverUrl === null) {
      return;
    }

    // Request to `info/me` and update if necessary.
    const changed = await this.updateUser();
    if (changed) {
      this.updateGlobalOc?.(this);
    }
  }

  /**
   * Updates `#currentUser` and `#ltiSession` by checking 'info/me.json' and
   * `/lti` respectively.
   *
   * The `#state` is also updated accordingly to `STATE_LOGGED_IN`,
   * `STATE_INCORRECT_LOGIN` or `STATE_CONNECTED` (or any error state on request
   * error). This method returns whether the state, user object or lti object
   * has changed in any way.
   */
  async updateUser(): Promise<boolean> {
    // Try to request `info/me.json` and handle potential errors.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let newUser: any;
    try {
      newUser = await this.getInfoMe();
    } catch (e) {
      // If it's not our own error, rethrow it.
      if (!(e instanceof RequestError)) {
        throw e;
      }

      console.error("error when getting info/me", e);

      const oldState = this.#state;

      // Update state, depending on kind of error.
      if (e instanceof NetworkError) {
        this.#state = STATE_NETWORK_ERROR;
      } else if (e instanceof Unauthorized) {
        this.#state = STATE_INCORRECT_LOGIN;
      } else if (e instanceof NotOkResponse) {
        this.#state = STATE_RESPONSE_NOT_OK;
      } else if (e instanceof UnexpectedRedirect) {
        // This might be too much of an assumption, but we interpret any
        // redirect as redirect to the login page, indicating that the user is
        // not logged in/does not have sufficient rights. Usually
        // `/info/me.json` is available to anonymous users, so we should never
        // get redirected. But this can be reconfigured.
        this.#state = STATE_INCORRECT_LOGIN;
      } else if (e instanceof InvalidJson) {
        this.#state = STATE_INVALID_RESPONSE;
      }

      const hasChanged = this.#currentUser !== null
        || this.#ltiSession !== null
        || oldState !== this.#state;
      this.#currentUser = null;
      this.#ltiSession = null;
      return hasChanged;
    }

    const userChanged = !equal(newUser, this.#currentUser);
    if (userChanged) {
      this.#currentUser = newUser;
      if (newUser?.user?.username === "anonymous") {
        this.#state = this.#login ? STATE_INCORRECT_LOGIN : STATE_CONNECTED;
      } else if (newUser?.user?.username) {
        this.#state = STATE_LOGGED_IN;
      } else {
        this.#state = STATE_INVALID_RESPONSE;
      }
    }

    // Only check LTI context information if we are in an integrated situation.
    // If the user authenticates via username/password (via HTTP basic auth),
    // there is never an LTI session. (Well, at least the people I talked to
    // think so).
    if (this.#login !== true) {
      const hasChanged = userChanged || this.#ltiSession !== null;
      this.#ltiSession = null;
      return hasChanged;
    }

    // Attempt to fetch LTI information and handle potential errors.
    let newLtiSession;
    try {
      newLtiSession = await this.getLti();
    } catch (e) {
      // If it's not our own error, rethrow it.
      if (!(e instanceof RequestError)) {
        throw e;
      }

      console.error("Error when getting LTI info: ", e);

      const oldState = this.#state;

      if (e instanceof NetworkError) {
        // Highly unlikely as the previous request suceeded.
        this.#state = STATE_NETWORK_ERROR;
      } else if (e instanceof Unauthorized || e instanceof UnexpectedRedirect) {
        // It might be that the user has not access to this endpoint. In this
        // case, there is no LTI session. We do not switch to an error state.
      } else {
        // In the cases of strange or invalid responses, we just ignore it for
        // now. I don't know when that would occur. No need to switch to an
        // error state for now.
      }

      const hasChanged = userChanged || this.#ltiSession !== null || oldState !== this.#state;
      this.#ltiSession = null;
      return hasChanged;
    }

    const ltiChanged = !equal(newLtiSession, this.#ltiSession);
    this.#ltiSession = newLtiSession;

    return userChanged || ltiChanged;
  }

  /** Returns the response from the `/info/me.json` endpoint. */
  async getInfoMe(): Promise<object | null> {
    return await this.jsonRequest("info/me.json");
  }

  /** Returns the value from user.name from the `/info/me.json` endpoint. */
  getUsername(): string | null {
    if (!(
      this.#currentUser
      && typeof this.#currentUser === "object"
      && "user" in this.#currentUser
      && this.#currentUser.user
      && typeof this.#currentUser.user === "object"
      && "name" in this.#currentUser.user
      && typeof this.#currentUser.user.name === "string"
    )) {
      return null;
    }
    return this.#currentUser.user.name;
  }

  /** Returns the response from the `/lti` endpoint. */
  async getLti(): Promise<object | null> {
    return await this.jsonRequest("lti");
  }

  /**
   * Sends a request to the Opencast API expecting a JSON response.
   *
   * On success, the parsed JSON is returned as object. If anything goes wrong,
   * a `RequestError` is thrown and the corresponding `this.#state` is set.
   */
  async jsonRequest(path: string): Promise<object | null> {
    const url = `${this.#serverUrl}/${path}`;
    const response = await this.request(path);

    try {
      const out = await response.json();
      if (typeof out !== "object") {
        throw new Error(`'${path}' did not return an object`);
      }
      return out;
    } catch (e) {
      throw new InvalidJson(url, e);
    }
  }

  /**
   * Sends a request to the Opencast API, returning the response object.
   *
   * If anything goes wrong, a `RequestError` is thrown and the corresponding
   * `this.#state` is set.
   */
  async request(path: string, options?: RequestInit) {
    const url = `${this.#serverUrl}/${path}`;

    // Add HTTP Basic Auth headers if username and password are provided.
    let headers = {};
    if (this.#login !== true && this.#login?.username && this.#login?.password) {
      const encoded = btoa(unescape(encodeURIComponent(
        this.#login.username + ":" + this.#login.password,
      )));
      headers = { "Authorization": `Basic ${encoded}` };
    }

    let response: Response;
    try {
      response = await fetch(url, {
        ...options,
        credentials: "same-origin",
        redirect: "manual",
        headers,
      });
    } catch (e) {
      throw new NetworkError(url, e);
    }

    // Handle 401 Bad credentials for HTTP Basic Auth
    if (response.status === 401 || response.status === 403) {
      throw new Unauthorized(response.status, response.statusText, url);
    }

    if (response.type === "opaqueredirect") {
      throw new UnexpectedRedirect(url);
    }

    if (!response.ok) {
      throw new NotOkResponse(response.status, response.statusText, url);
    }

    return response;
  }

  /**
   * Uploads the given recordings with the given title and presenter metadata.
   *
   * If the upload was successful, 'success' is returned. Otherwise:
   * - 'network_error' if some kind of network error occurs.
   * - 'not_authorized' if some error occurs that indicates the user is not
   *    logged in or lacking rights.
   * - 'unexpected_response' if the API returned data that we didn't expect.
   * - 'unknown_error' if any other error occurs.
   *
   * At the start of this method, `refreshConnection` is called. That
   * potentially changed the `state`.
   */
  async upload({
    recordings, title, presenter, series, start, end, uploadSettings, startTime, endTime, onProgress,
  }: {
    recordings: Recording[];
    title: string;
    presenter: string;
    start: number | null;
    end: number | null;
    startTime: Date;
    endTime: Date;
    series: string | null;
    uploadSettings: Settings["upload"];
    onProgress: (p: number) => void;
  }): Promise<UploadState> {
    // Refresh connection and check if we are ready to upload.
    await this.refreshConnection();
    switch (this.#state) {
      case STATE_LOGGED_IN:
        break;
      case STATE_NETWORK_ERROR:
        return "network_error";
      case STATE_INCORRECT_LOGIN:
      case STATE_CONNECTED:
        return "not_authorized";
      case STATE_INVALID_RESPONSE:
        return "unexpected_response";
      default:
        return "unknown_error";
    }

    // Actually upload
    try {
      // Create new media package
      let mediaPackage = await this.request("ingest/createMediaPackage")
        .then(response => response.text());

      // Add metadata to media package
      mediaPackage = await this.addDcCatalog(
        { mediaPackage, uploadSettings, title, presenter, series, startTime, endTime },
      );

      // Set appropriate ACL unless the configuration says no.
      if (uploadSettings?.acl !== false) {
        mediaPackage = await this.attachAcl({ mediaPackage, uploadSettings });
      }

      // Add all recordings (this is the actual upload).
      mediaPackage = await this.uploadTracks(
        { mediaPackage, recordings, onProgress, title, presenter },
      );

      if (start != null || end != null) {
        mediaPackage = await this.addCuttingInformation({
          mediaPackage,
          // We set the defaults here, instead of in the state,
          // so that we don't even have to send a SMIL catalog,
          // when the user didn't cut at all.
          start: start || 0,
          end: end || Number.MAX_VALUE,
        });
      }

      // Finalize/ingest media package
      await this.finishIngest({ mediaPackage, uploadSettings });

      return "success";
    } catch (e) {
      // Any error not thrown by us is rethrown.
      if (!(e instanceof RequestError)) {
        throw e;
      }

      console.error("Error occured during upload: ", e);

      if (e instanceof NetworkError) {
        return "network_error";
      } else if (e instanceof UnexpectedRedirect || e instanceof Unauthorized) {
        // Again, we boldly assume that any redirect is a redirect to the login
        // page. This might be wrong, but until someone has a problem, this is
        // the sanest option IMO. A well-designed API shouldn't redirect in
        // those cases, of course. But we are not dealing with such an API here.
        return "not_authorized";
      } else if (e instanceof NotOkResponse) {
        return "unexpected_response";
      } else {
        return "unknown_error";
      }
    }
  }

  /**
   * Adds the DC Catalog with the given metadata to the current ingest process
   * via `ingest/addDCCatalog`. Do not call this method outside of `upload`!
   */
  async addDcCatalog({ mediaPackage, uploadSettings, series, ...rest }: {
    mediaPackage: string;
    title: string;
    presenter: string;
    series: string | null;
    uploadSettings: Settings["upload"];
    startTime: Date;
    endTime: Date;
  }) {
    const seriesId = series ? series : uploadSettings?.seriesId;
    const template = uploadSettings?.dcc || DEFAULT_DCC_TEMPLATE;
    const dcc = this.constructDcc(template, { ...rest, seriesId });

    const body = new FormData();
    body.append("mediaPackage", mediaPackage);
    body.append("dublinCore", encodeURIComponent(dcc));
    body.append("flavor", "dublincore/episode");

    return await this.request("ingest/addDCCatalog", { method: "post", body })
      .then(response => response.text());
  }

  /**
   * Adds the ACL to the current ingest process via `ingest/addAttachment`. Do
   * not call this method outside of `upload`!
   */
  async attachAcl({ mediaPackage, uploadSettings }: {
    mediaPackage: string;
    uploadSettings: Settings["upload"];
  }) {
    const template = uploadSettings?.acl === true || (!uploadSettings?.acl)
      ? DEFAULT_ACL_TEMPLATE
      : uploadSettings?.acl;
    const acl = this.constructAcl(template);

    const body = new FormData();
    body.append("flavor", "security/xacml+episode");
    body.append("mediaPackage", mediaPackage);
    body.append("BODY", new Blob([acl]), "acl.xml");

    return await this.request("ingest/addAttachment", { method: "post", body: body })
      .then(response => response.text());
  }

  /** Adds a SMIL catalog for Opencast to cut the video during processing */
  async addCuttingInformation({ mediaPackage, start, end }: {
    mediaPackage: string;
    start: number;
    end: number;
  }) {
    const body = new FormData();
    body.append("flavor", "smil/cutting");
    body.append("mediaPackage", mediaPackage);
    body.append("BODY", new Blob([smil({ start, end })]), "cutting.smil");
    const response = await this.request("ingest/addCatalog", { method: "post", body });
    return await response.text();
  }

  /**
   * Uploads the given recordings to the current ingest process via
   * `ingest/addTrack`. Do not call this method outside of `upload`!
   */
  async uploadTracks({ mediaPackage, recordings, onProgress, title, presenter }: {
    mediaPackage: string;
    recordings: Recording[];
    onProgress: (p: number) => void;
    title: string;
    presenter: string;
  }) {
    const totalBytes = recordings.map(r => r.media.size).reduce((a, b) => a + b, 0);
    let finishedTracksBytes = 0;

    for (const { deviceType, media, mimeType } of recordings) {
      const finishedBytes = finishedTracksBytes;
      let trackFlavor = "presentation/source";
      if (deviceType === "desktop") {
        trackFlavor = "presentation/source";
      } else if (deviceType === "video") {
        trackFlavor = "presenter/source";
      }

      const flavor = deviceType === "desktop" ? "presentation" : "presenter";
      const downloadName = recordingFileName({ mime: mimeType, flavor, title, presenter });

      const body = new FormData();
      body.append("mediaPackage", mediaPackage);
      body.append("flavor", trackFlavor);
      body.append("tags", "");
      body.append("BODY", media, downloadName);

      // We have to upload with XHR here, as `fetch` does not currently offer a
      // way to get the upload progress. Meh.
      const url = `${this.#serverUrl}/ingest/addTrack`;
      mediaPackage = await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", url);

        // Add HTTP Basic Auth headers if username and password are provided.
        if (this.#login !== true && this.#login?.username && this.#login?.password) {
          const encoded = btoa(unescape(encodeURIComponent(
            this.#login.username + ":" + this.#login.password,
          )));
          xhr.setRequestHeader("Authorization", `Basic ${encoded}`);
        }

        xhr.onload = () => resolve(xhr.responseText);
        xhr.onerror = () => {
          // Handle 401 Bad credentials for HTTP Basic Auth
          if (xhr.status === 401 || xhr.status === 403) {
            reject(new Unauthorized(xhr.status, xhr.statusText, url));
          } else {
            reject(new NotOkResponse(xhr.status, xhr.statusText, url));
          }
        };
        xhr.upload.onprogress = e => {
          if (onProgress) {
            const totalLoaded = e.loaded + finishedBytes;
            onProgress(totalLoaded / totalBytes);
          }
        };

        try {
          xhr.send(body);
        } catch (e) {
          reject(new NetworkError(url, e));
        }
      });

      finishedTracksBytes += media.size;
    }

    return mediaPackage;
  }

  /**
   * Finishes the current ingest process via `ingest/ingest`. Do not call this
   * method outside of `upload`!
   */
  async finishIngest({ mediaPackage, uploadSettings }: {
    mediaPackage: string;
    uploadSettings: Settings["upload"];
  }) {
    const workflowId = uploadSettings?.workflowId;

    const body = new FormData();
    body.append("mediaPackage", mediaPackage);
    if (workflowId) {
      body.append("workflowDefinitionId", workflowId);
    }
    await this.request("ingest/ingest", { method: "post", body: body });
  }

  /** Returns the current state of the connection to the OC server. */
  getState() {
    return this.#state;
  }

  /**
   * Returns whether or not a login is already provided (i.e. we don't need to
   * login manually).
   */
  isLoginProvided() {
    return this.#login === true;
  }

  /** Returns whether or not the connection is ready to upload a video. */
  isReadyToUpload() {
    return this.#state === STATE_LOGGED_IN;
  }

  /**
   * Returns the server URL in a form suitable to present to the user. Returns
   * `null` if the server URL is not configured yet or if it is the same
   * hostname as the one studio is running on.
   */
  prettyServerUrl() {
    const url = this.#serverUrl;

    return url && url.startsWith("https")
      ? new URL(url).hostname
      : null;
  }

  /** Constructs the ACL XML structure from the given template string. */
  constructAcl(template: string) {
    const hasRoles = (user: unknown): user is { roles: unknown[] } =>
      user != null && typeof user === "object" && "roles" in user && Array.isArray(user.roles);

    if (!hasRoles(this.#currentUser)) {
      // Internal error: this should not happen.
      throw new Error(`'currentUser' is '${JSON.stringify(this.#currentUser)}' in 'constructAcl'`);
    }

    // Prepare template "view": the values that can be used within the template.
    const view = {
      user: this.#currentUser,
      lti: this.#ltiSession,
      roleOAuthUser: this.#currentUser.roles.find(r => r === "ROLE_OAUTH_USER"),
    };

    return renderTemplate(template, view);
  }

  constructDcc(template: string, { title, presenter, startTime, endTime, seriesId }: {
    title: string;
    presenter: string;
    startTime: Date;
    endTime: Date;
    seriesId?: string;
  }) {
    // Prepare template "view": the values that can be used within the template.
    const view = {
      user: this.#currentUser,
      lti: this.#ltiSession,
      title,
      presenter,
      seriesId,
      now: new Date().toISOString(),
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
    };

    return renderTemplate(template, view);
  }
}


// ===== Errors that can occur when accessing the Opencast API =====

/** Base error */
class RequestError extends Error {}

/**
 * The fetch itself failed. This unfortunately can have many causes, including
 * blocked by browser, CORS, server not available, device offline, ...
 */
class NetworkError extends RequestError {
  constructor(url: string, cause: unknown) {
    super(`network error when accessing '${url}': ${cause}`);
  }
}

/** When requesting a JSON API but the response body is not valid JSON. */
class InvalidJson extends RequestError {
  constructor(url: string, cause: unknown) {
    super(`invalid JSON when accessing ${url}: ${cause}`);
  }
}

/** When the request returns 401. */
class Unauthorized extends RequestError {
  constructor(status: number, statusText: string, url: string) {
    super(`got ${status} ${statusText} when accessing ${url}`);
  }
}

/** When the request returns a non-2xx status code. */
class NotOkResponse extends RequestError {
  constructor(status: number, statusText: string, url: string) {
    super(`unexpected ${status} ${statusText} response when accessing ${url}`);
  }
}

class UnexpectedRedirect extends RequestError {
  constructor(url: string) {
    super(`unexpected redirect when accessing ${url}`);
  }
}


// ===== The Opencast context and `useOpencast` =====

const Context = React.createContext<Opencast | null>(null);

/** Returns the current provided Opencast instance. */
export const useOpencast = (): Opencast => usePresentContext(Context, "useOpencast");

type ProviderProps = React.PropsWithChildren<{
  initial: Opencast;
}>;

export const Provider: React.FC<ProviderProps> = ({ initial, children }) => {
  const [, setDummy] = useState(0);
  const [opencast, setOpencast] = useState(initial);
  opencast.updateGlobalOc = newInstance => {
    setOpencast(newInstance);

    // If the object reference didn't change, we use this dummy state to force a
    // rerender.
    if (opencast === newInstance) {
      setDummy(old => old + 1);
    }
  };

  // This debug output will be useful for future debugging sessions.
  useEffect(() => {
    console.debug("Current Opencast connection: ", opencast);

    // To avoid problems of session timeouts, we request `info/me` every 5
    // minutes. The additional server load should be negligible, it won't
    // notably stress the user's internet connection and is below almost all
    // sensible timeouts.
    const interval = setInterval(() => opencast.refreshConnection(), 5 * 60 * 1000);

    return () => clearInterval(interval);
  });

  return (
    <Context.Provider value={opencast}>
      {children}
    </Context.Provider>
  );
};


// ===== Stuff related to upload metadata =====

const escapeString = (s: string) => new XMLSerializer().serializeToString(new Text(s));

const renderTemplate = (template: string, view: object): string => {
  const originalEscape = Mustache.escape;
  Mustache.escape = escapeString;
  const out = Mustache.render(template, view);
  Mustache.escape = originalEscape;
  return out;
};

const DEFAULT_DCC_TEMPLATE = `<?xml version="1.0" encoding="UTF-8"?>
<dublincore xmlns="http://www.opencastproject.org/xsd/1.0/dublincore/"
            xmlns:dcterms="http://purl.org/dc/terms/"
            xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
    <dcterms:created xsi:type="dcterms:W3CDTF">{{ now }}</dcterms:created>
    <dcterms:title>{{ title }}</dcterms:title>
    {{ #presenter }}<dcterms:creator>{{ presenter }}</dcterms:creator>{{ /presenter }}
    {{ #seriesId }}<dcterms:isPartOf>{{ seriesId }}</dcterms:isPartOf>{{ /seriesId }}
    <dcterms:temporal xsi:type="dcterms:Period">
      start={{ startTime }}; end={{ endTime }}; scheme=W3CDTF;
    </dcterms:temporal>
    <dcterms:spatial>Opencast Studio</dcterms:spatial>
</dublincore>
`;

const DEFAULT_ACL_TEMPLATE = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Policy PolicyId="mediapackage-1"
  RuleCombiningAlgId="urn:oasis:names:tc:xacml:1.0:rule-combining-algorithm:permit-overrides"
  Version="2.0"
  xmlns="urn:oasis:names:tc:xacml:2.0:policy:schema:os">
  <Rule RuleId="user_read_Permit" Effect="Permit">
    <Target>
      <Actions>
        <Action>
          <ActionMatch MatchId="urn:oasis:names:tc:xacml:1.0:function:string-equal">
            <AttributeValue DataType="http://www.w3.org/2001/XMLSchema#string">read</AttributeValue>
            <ActionAttributeDesignator AttributeId="urn:oasis:names:tc:xacml:1.0:action:action-id"
              DataType="http://www.w3.org/2001/XMLSchema#string"/>
          </ActionMatch>
        </Action>
      </Actions>
    </Target>
    <Condition>
      <Apply FunctionId="urn:oasis:names:tc:xacml:1.0:function:string-is-in">
        <AttributeValue DataType="http://www.w3.org/2001/XMLSchema#string">{{ user.userRole }}</AttributeValue>
        <SubjectAttributeDesignator AttributeId="urn:oasis:names:tc:xacml:2.0:subject:role"
          DataType="http://www.w3.org/2001/XMLSchema#string"/>
      </Apply>
    </Condition>
  </Rule>
  <Rule RuleId="user_write_Permit" Effect="Permit">
    <Target>
      <Actions>
        <Action>
          <ActionMatch MatchId="urn:oasis:names:tc:xacml:1.0:function:string-equal">
            <AttributeValue DataType="http://www.w3.org/2001/XMLSchema#string">write</AttributeValue>
            <ActionAttributeDesignator AttributeId="urn:oasis:names:tc:xacml:1.0:action:action-id"
              DataType="http://www.w3.org/2001/XMLSchema#string"/>
          </ActionMatch>
        </Action>
      </Actions>
    </Target>
    <Condition>
      <Apply FunctionId="urn:oasis:names:tc:xacml:1.0:function:string-is-in">
        <AttributeValue DataType="http://www.w3.org/2001/XMLSchema#string">{{ user.userRole }}</AttributeValue>
        <SubjectAttributeDesignator AttributeId="urn:oasis:names:tc:xacml:2.0:subject:role"
          DataType="http://www.w3.org/2001/XMLSchema#string"/>
      </Apply>
    </Condition>
  </Rule>
</Policy>
`;

const smil = ({ start, end }: { start: number; end: number }) => `
  <smil xmlns="http://www.w3.org/ns/SMIL">
    <body>
      <par>
        <video clipBegin="${start}s" clipEnd="${end}s" />
      </par>
    </body>
  </smil>
`;
