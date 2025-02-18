import { HTMLInputTypeAttribute, useEffect, useId, useRef, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import Select, { CSSObjectWithLabel, SelectInstance } from "react-select";
import {
  ControllerRenderProps, FieldError, FieldValues, Path, SubmitHandler, Validate,
  useController, useForm,
} from "react-hook-form";
import { FiUpload } from "react-icons/fi";
import { LuCheckCircle2 } from "react-icons/lu";
import { ProtoButton, Spinner, match, notNullish, unreachable, useColorScheme } from "@opencast/appkit";

import { useDispatch, useStudioState } from "../../studio-state";
import { Opencast, useOpencast } from "../../opencast";
import { useSettings, useSettingsManager } from "../../settings";
import { COLORS, focusStyle } from "../../util";
import { ErrorBox } from "../../ui/ErrorBox";
import { prettyFileSize, sharedButtonStyle } from ".";


const LAST_PRESENTER_KEY = "ocStudioLastPresenter";

let progressHistory: { timestamp: number; progress: number }[] = [];


export const UploadBox: React.FC = () => {
  const settings = useSettings();
  const { t } = useTranslation();
  const opencast = useOpencast();
  const { recordings, upload: uploadState, title, presenter, ...state } = useStudioState();
  const dispatch = useDispatch();

  function onProgress(progress: number) {
    // ----- Time estimation -----
    // We use a simple sliding average over the last few data points and assume
    // that speed for the rest of the upload.
    const now = Date.now();

    // Add progress data point to history.
    progressHistory.push({
      timestamp: now,
      progress,
    });

    // The size of the sliding window in milliseconds.
    const WINDOW_SIZE_MS = 5000;
    // The size of the sliding window in number of data points.
    const WINDOW_SIZE_DATA_POINTS = 6;
    // The number of datapoints below which we won't show a time estimate.
    const MINIMUM_DATA_POINT_COUNT = 4;

    // Find the first element within the window. We use the larger window of the
    // two windows created by the two constraints (time and number of
    // datapoints).
    const windowStart = Math.min(
      progressHistory.findIndex(p => (now - p.timestamp) < WINDOW_SIZE_MS),
      Math.max(0, progressHistory.length - WINDOW_SIZE_DATA_POINTS),
    );

    // Remove all elements outside the window.
    progressHistory.splice(0, windowStart);

    let secondsLeft: null | number = null;
    if (progressHistory.length >= MINIMUM_DATA_POINT_COUNT) {
      // Calculate the remaining time based on the average speed within the window.
      const windowLength = now - progressHistory[0].timestamp;
      const progressInWindow = progress - progressHistory[0].progress;
      const progressPerSecond = (progressInWindow / windowLength) * 1000;
      const progressLeft = 1 - progress;
      secondsLeft = Math.max(0, Math.round(progressLeft / progressPerSecond));
    }

    // Update state if anything changed. We actually check for equality here to
    // avoid useless redraws.
    if (uploadState.secondsLeft !== secondsLeft || uploadState.currentProgress !== progress) {
      dispatch({
        type: "UPLOAD_PROGRESS_UPDATE",
        secondsLeft,
        currentProgress: progress,
      });
    }
  }

  useEffect(() => {
    // To still update the time estimation, we make sure to call `onProgress` at
    // least every so often.
    const interval = setInterval(() => {
      if (uploadState.state !== "uploading") {
        return;
      }

      if (!progressHistory.length) {
        onProgress(0);
      } else {
        const lastProgress = progressHistory[progressHistory.length - 1];
        const timeSinceLastUpdate = Date.now() - lastProgress.timestamp;
        if (timeSinceLastUpdate > 3000) {
          onProgress(lastProgress.progress);
        }
      }
    }, 1000);

    return () => clearInterval(interval);
  });

  const handleUpload: SubmitHandler<Inputs> = async data => {
    dispatch({ type: "UPLOAD_REQUEST" });
    progressHistory.push({
      timestamp: Date.now(),
      progress: 0,
    });
    const result = await opencast.upload({
      recordings: recordings.filter(Boolean),
      title: data.title,
      presenter: data.presenter,
      series: data.series,
      uploadSettings: settings.upload,
      onProgress,
      start: state.start,
      end: state.end,
      startTime: state.recordingStartTime ?? unreachable("no start time set"),
      endTime: state.recordingEndTime ?? unreachable("no end time set"),
    });
    progressHistory = [];

    const dispatchError = (msg: string) => dispatch({ type: "UPLOAD_ERROR", msg });
    match(result, {
      "success": () => dispatch({ type: "UPLOAD_SUCCESS" }),
      "network_error": () => dispatchError(t("steps.finish.upload.upload-network-error")),
      "not_authorized": () => dispatchError(t("steps.finish.upload.upload-not-authorized")),
      "unexpected_response": () => dispatchError(t("steps.finish.upload.upload-invalid-response")),
    }, () => dispatchError(t("steps.finish.upload.upload-unknown-error")));
  };

  switch (uploadState.state) {
    case "uploading":
      return <UploadProgress
        currentProgress={uploadState.currentProgress}
        secondsLeft={uploadState.secondsLeft}
      />;
    case "uploaded":
      return <UploadSuccess />;
    default: // "not_uploaded" or "error"
      return <UploadForm {...{ uploadState, handleUpload }} />;
  }
};


type Inputs = {
  title: string;
  presenter: string;
  series: string;
  serverUrl: string;
  loginName: string;
  loginPassword: string;
};

type UploadFormProps = {
  handleUpload: SubmitHandler<Inputs>;
};

const UploadForm: React.FC<UploadFormProps> = ({ handleUpload }) => {
  const {
    titleField = "required",
    presenterField = "required",
    seriesField = "optional",
    autofillPresenter = [],
  } = useSettings().upload ?? {};

  const { t, i18n } = useTranslation();
  const opencast = useOpencast();
  const dispatch = useDispatch();
  const settingsManager = useSettingsManager();
  const { title, presenter, upload: uploadState, recordings } = useStudioState();
  const presenterValue = presenter
    || window.localStorage.getItem(LAST_PRESENTER_KEY)
    || autofillPresenter
      .map(source => match(source, {
        "opencast": () => opencast.getUsername(),
      }))
      .find(Boolean)
    || "";

  type FormState = "idle" | "testing";
  const [state, setState] = useState<FormState>("idle");

  const { formState: { errors }, handleSubmit, register, control, getValues } = useForm<Inputs>({
    defaultValues: settingsManager.formValues().opencast,
  });
  const { field: seriesSelect } = useController({
    name: "series",
    control,
    rules: {
      required: seriesField === "required"
        ? t("steps.finish.upload.validation-error-required")
        : false,
    },
  });

  // This is a bit ugly, but works. We want to make sure that the `title` and
  // `presenter` values in the studio state always equal the current value in
  // the input.
  function handleInputChange(event: React.ChangeEvent<HTMLInputElement>) {
    const target = event.target;
    dispatch({
      type: notNullish(
        ({ title: "UPDATE_TITLE", presenter: "UPDATE_PRESENTER" } as const)[target.name],
      ),
      value: target.value,
    });

    if (target.name === "presenter") {
      window.localStorage.setItem(LAST_PRESENTER_KEY, target.value);
    }
  }

  // If the user has not yet changed the value of the field, but it has been prefilled
  // from local storage or one of the `autofillPresenter` sources, update the state
  // using that value.
  useEffect(() => {
    if (presenterValue !== presenter) {
      dispatch({ type: "UPDATE_PRESENTER", value: presenterValue });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const configurableServerUrl = settingsManager.isConfigurable("opencast.serverUrl");
  const configurableUsername = settingsManager.isUsernameConfigurable();
  const configurablePassword = settingsManager.isPasswordConfigurable();
  const showOpencastSection = configurableServerUrl || configurableUsername || configurablePassword;

  const ocDataFromInputs = (data: Inputs) => ({
    serverUrl: data.serverUrl,
    loginName: data.loginName,
    loginPassword: data.loginPassword,
  });

  const onSubmit: SubmitHandler<Inputs> = async data => {
    if (!showOpencastSection) {
      await handleUpload(data);
      return;
    }

    console.log(data);
    setState("testing");

    // Update Opencast connection data. This is a bit roundabout right now as
    // the Opencast logic is still from pre-redesign, where the connection data
    // was given on a separate settings page.
    const ocData = ocDataFromInputs(data);
    const oc = await Opencast.init({
      ...settingsManager.settings().opencast,
      ...ocData,
    });

    const error = match(oc.getState(), {
      "logged_in": () => {
        opencast.setGlobalInstance(oc);
        settingsManager.saveSettings({ opencast: ocData });
        return null;
      },
      "incorrect_login": () => opencast.isLoginProvided()
        ? t("steps.finish.upload.settings-invalid-provided-login")
        : t("steps.finish.upload.settings-invalid-login-data"),
      "network_error": () => t("steps.finish.upload.upload-network-error"),
      "invalid_response": () => t("steps.finish.upload.upload-invalid-response"),
      "response_not_ok": () => t("steps.finish.upload.upload-invalid-response"),
    }, () => unreachable());

    if (error) {
      dispatch({ type: "UPLOAD_ERROR", msg: error });
      setState("idle");
    } else {
      // The connection to Opencast works -> now actually start the upload.
      await handleUpload(data);
    }
  };

  const totalBytes = recordings.reduce((acc, rec) => acc + rec.media.size, 0);
  const uploadSize = prettyFileSize(totalBytes, i18n);
  const { isHighContrast } = useColorScheme();

  // Testing the new connection settings to establish a connection ASAP to make
  // the series selector work.
  const onConnectionSettingChange = async () => {
    const data = getValues();

    // If nothing changed, do nothing.
    const ocSettings = settingsManager.settings().opencast;
    const anyChange = (data.serverUrl && data.serverUrl !== ocSettings?.serverUrl)
      || (data.loginName && data.loginName !== ocSettings?.loginName)
      || (data.loginPassword && data.loginPassword !== ocSettings?.loginPassword);
    if (!anyChange) {
      return;
    }

    const ocData = ocDataFromInputs(data);
    const oc = await Opencast.init({
      ...settingsManager.settings().opencast,
      ...ocData,
    });

    if (oc.getState() === "logged_in") {
      opencast.setGlobalInstance(oc);
      settingsManager.saveSettings({ opencast: ocData });
    }
  };

  return (
    <>
      <form onSubmit={handleSubmit(onSubmit)}>
        {titleField !== "hidden" && <Input
          name="title"
          label={t("steps.finish.upload.label-title")}
          required={titleField === "required"}
          onChange={handleInputChange}
          autoComplete="off"
          defaultValue={title}
          autoFocus
          {...{ errors, register }}
        />}
        {presenterField !== "hidden" && <Input
          name="presenter"
          label={t("steps.finish.upload.label-presenter")}
          required={presenterField === "required"}
          onChange={handleInputChange}
          autoComplete="off"
          defaultValue={presenterValue}
          {...{ errors, register }}
        />}
        {seriesField !== "hidden" && <SeriesSelect
          formProps={seriesSelect}
          showOpencastSection={showOpencastSection}
          errors={errors}
        />}

        {showOpencastSection && <>
          <h3 css={{
            fontSize: 16,
            fontWeight: 700,
            marginTop: 20,
          }}>{t("steps.finish.upload.settings-header")}</h3>

          {configurableServerUrl && <Input
            errors={errors}
            label={t("steps.finish.upload.settings-label-server-url")}
            name="serverUrl"
            register={register}
            onBlur={onConnectionSettingChange}
            required
            validate={(value: string) => {
              try {
                const url = new URL(value);
                return (url.protocol === "https:" || url.protocol === "http:")
                  || t("steps.finish.upload.settings-invalid-url-http-start");
              } catch {
                let err = t("steps.finish.upload.settings-invalid-url");
                if (!value.startsWith("https://") && !value.startsWith("http://")) {
                  err += " " + t("steps.finish.upload.settings-invalid-url-http-start");
                }
                return err;
              }
            }}
          />}

          {configurableUsername && <Input
            errors={errors}
            label={t("steps.finish.upload.settings-label-username")}
            name="loginName"
            register={register}
            onBlur={onConnectionSettingChange}
            required
          />}

          {configurablePassword && <Input
            errors={errors}
            label={t("steps.finish.upload.settings-label-password")}
            name="loginPassword"
            register={register}
            onBlur={onConnectionSettingChange}
            required
            type="password"
          />}
        </>}

        {/* Upload button */}
        <ProtoButton
          type="submit"
          css={{
            ...sharedButtonStyle(isHighContrast),
            margin: "0 auto",
            marginTop: 24,
          }}
        >
          {match(state, {
            "idle": () => <FiUpload css={{ fontSize: 20 }} />,
            "testing": () => <Spinner size={20} />,
          })}
          <span>{t("steps.finish.upload.label") + " (" + uploadSize + ")"}</span>
        </ProtoButton>
      </form>

      {/* Upload error box */}
      <div css={{ marginTop: 8 }}>
        {uploadState.state === "error" && (
          <ErrorBox
            css={{ margin: 0 }}
            body={notNullish(uploadState.error)}
            extraBody={t("steps.finish.upload.warn-download-hint")}
          />
        )}
      </div>
    </>
  );
};

type InputProps<I extends FieldValues, F> =
  Pick<
    JSX.IntrinsicElements["input"],
    "onChange" | "autoComplete" | "defaultValue" | "onBlur"
  > &
  Pick<ReturnType<typeof useForm<I>>, "register"> & {
    /** Human readable string describing the field. */
    label: string;
    name: Path<I>;
    /** Whether this field is required or may be empty. */
    required: boolean;
    /** Function validating the value and returning a string in the case of error. */
    validate?: Validate<F, I>;
    errors: Partial<Record<keyof I, FieldError>>;
    /** Passed to the `<input>`. */
    type?: HTMLInputTypeAttribute;
    autoFocus?: boolean;
  };

/**
 * A styled `<input>` element with a label. Displays errors and integrated with
 * `react-hook-form`.
 */
export const Input = <I extends FieldValues, F>({
  errors,
  register,
  label,
  name,
  required,
  validate,
  type = "text",
  ...rest
}: InputProps<I, F>) => {
  const { t } = useTranslation();
  const error = errors[name];
  const id = useId();

  return (
    <div css={{ marginBottom: 12 }}>
      <label htmlFor={id} css={{
        display: "block",
        fontWeight: 700,
        color: COLORS.neutral70,
        margin: "4px 0",
        fontSize: 14,
      }}>
        {label}
      </label>
      <div css={{
        display: "block",
        boxSizing: "border-box",
        position: "relative",
        textAlign: "left",
      }}>
        <input
          id={id}
          aria-invalid={error ? "true" : "false"}
          aria-describedby={error ? `${name}Error` : id}
          autoComplete="off"
          type={type}
          {...rest}
          {...register(name, {
            validate,
            onChange: rest.onChange,
            onBlur: rest.onBlur,
            ...required && { required: t("steps.finish.upload.validation-error-required") },
          })}
          css={{
            display: "block",
            width: "100%",
            borderRadius: 4,
            border: `1px solid ${error ? COLORS.danger4 : COLORS.neutral30}`,
            backgroundColor: COLORS.neutral00,
            color: COLORS.neutral70,
            padding: "8px 16px",
            ...focusStyle({ offset: -1 }),
          }}
        />
        {error && <ErrorContainer id={`${name}Error`}>
          {error.message}
        </ErrorContainer>}
      </div>
    </div>
  );
};

type ErrorContainerProps = React.PropsWithChildren<{
  id: string;
}>;

const ErrorContainer: React.FC<ErrorContainerProps> = ({ id, children }) => (
  <div
    id={id}
    css={{
      backgroundColor: COLORS.danger1,
      color: COLORS.danger5,
      marginTop: 4,
      borderRadius: 4,
      padding: "6px 12px",
      lineHeight: 1.2,
    }}
  >
    {children}
  </div>
);


type SeriesSelectProps = {
  formProps: ControllerRenderProps<Inputs, "series">;
  showOpencastSection: boolean;
  errors: Partial<Record<keyof Inputs, FieldError>>;
};

const SeriesSelect: React.FC<SeriesSelectProps> = ({ formProps, showOpencastSection, errors }) => {
  const { t, i18n } = useTranslation();
  const opencast = useOpencast();
  const { scheme } = useColorScheme();
  const seriesId = useSettings().upload?.seriesId;

  type Option = { value: string; label: string };
  const [options, setOptions] = useState<Option[] | "error" | null>(null);
  const ref = useRef<SelectInstance<Option>>(null);
  useEffect(() => {
    setOptions(null);
    opencast.getSeries().then(
      result => {
        const options = [...result.entries()].map(([value, label]) => ({ value, label }));
        options.sort(
          (a, b) => a.label.localeCompare(b.label, i18n.language, { sensitivity: "base" }),
        );

        // If a seriesID is given, make the select use that as default value.
        if (seriesId) {
          const title = result.get(seriesId);
          const defaultOption = {
            label: title ?? t("steps.finish.upload.series-unknown"),
            value: seriesId,
          };
          if (title == null) {
            options.push(defaultOption);
          }
          ref.current?.setValue(defaultOption, "select-option");
        }

        setOptions(options);
      },
      e => {
        console.log("Error fetching series: ", e);
        setOptions("error");
      },
    );
  }, [opencast, t, i18n.language, seriesId]);

  const inputId = useId();
  const errorId = useId();
  const error = options === "error";
  return (
    <div css={{ marginBottom: 12 }}>
      <label htmlFor={inputId} css={{
        display: "block",
        fontWeight: 700,
        color: COLORS.neutral70,
        margin: "4px 0",
        fontSize: 14,
      }}>
        {t("steps.finish.upload.label-series")}
      </label>

      <Select
        id={inputId}
        ref={ref}
        options={options && options !== "error" ? options : []}
        isLoading={options === null}
        isDisabled={options === "error"}
        isClearable
        isSearchable
        onChange={data => formProps.onChange(data?.value)}
        onBlur={formProps.onBlur}
        aria-invalid={error ? "true" : "false"}
        aria-describedby={error ? errorId : inputId}

        // Styling
        placeholder={t("steps.finish.upload.series-placeholder")}
        loadingMessage={() => t("steps.finish.upload.series-loading")}
        noOptionsMessage={() => t("steps.finish.upload.series-none")}
        styles={selectStyles(scheme.startsWith("dark"), scheme.endsWith("high-contrast"))}
        theme={theme => ({
          ...theme,
          colors: {
            ...theme.colors,
            danger: COLORS.danger0,
            primary: COLORS.focus,
            neutral0: COLORS.neutral00,
            neutral5: COLORS.neutral15,
            neutral10: COLORS.neutral20,
            neutral20: COLORS.neutral30,
            neutral30: COLORS.neutral40,
            neutral40: COLORS.neutral50,
            neutral50: COLORS.neutral50,
            neutral60: COLORS.neutral60,
            neutral70: COLORS.neutral70,
            neutral80: COLORS.neutral80,
            neutral90: COLORS.neutral90,
          },
        })}
      />
      {error && (
        <ErrorContainer id={errorId}>
          {t("steps.finish.upload.series-fetch-error")}
          {showOpencastSection && (
            " " + t("steps.finish.upload.series-connection-settings-hint")
          )}
        </ErrorContainer>
      )}
      {errors["series"] && (
        <ErrorContainer id={errorId}>{errors["series"].message}</ErrorContainer>
      )}
    </div>
  );
};

export const selectStyles = (isDark: boolean, isHighContrast: boolean) => ({
  control: (baseStyles: CSSObjectWithLabel, state: { isFocused: boolean }) => ({
    ...baseStyles,
    backgroundColor: COLORS.neutral00,
    paddingLeft: 8,
    ...!state.isFocused && { borderColor: COLORS.neutral30 },
    ...state.isFocused && {
      // react-select uses box-shadow as outline. But it's not quite large
      // enough, so we override it here.
      boxShadow: `0 0 0 1.5px ${COLORS.focus}`,
    },
  }),
  input: (baseStyles: CSSObjectWithLabel) => ({
    ...baseStyles,
    color: COLORS.neutral80,
    padding: "4px 0",
  }),
  placeholder: (baseStyles: CSSObjectWithLabel) => ({
    ...baseStyles,
    color: COLORS.neutral60,
  }),
  singleValue: (baseStyles: CSSObjectWithLabel) => ({
    ...baseStyles,
    color: COLORS.neutral90,
  }),
  menuList: (baseStyles: CSSObjectWithLabel) => ({
    ...baseStyles,
    padding: 0,
  }),
  menu: (baseStyles: CSSObjectWithLabel) => ({
    ...baseStyles,
    ...isDark && { outline: `1px solid ${COLORS.neutral20}` },
    ...isHighContrast && { outline: `1px solid ${COLORS.neutral90}` },
    backgroundColor: isDark ? COLORS.neutral10 : COLORS.neutral05,
    overflow: "hidden",
  }),
  option: (_baseStyles: CSSObjectWithLabel, state: {
    isSelected: boolean;
    isFocused: boolean;
  }) => ({
    cursor: "default",
    padding: "6px 10px",
    borderLeft: `4px solid ${state.isSelected ? COLORS.focus : "transparent"}`,
    ...isHighContrast && state.isFocused && {
      outline: `2px solid ${COLORS.neutral90}`,
      outlineOffset: -3,
    },
    ...(state.isFocused || state.isSelected) && !isHighContrast && {
      backgroundColor: isDark ? COLORS.neutral25 : COLORS.neutral10,
    },
  }),
});


type UploadProgressProps = {
  currentProgress: number;
  secondsLeft: number | null;
};

/**
 * Shown during upload. Shows a progressbar, the percentage of data already
 * uploaded and `secondsLeft` nicely formatted as human readable time.
 */
const UploadProgress: React.FC<UploadProgressProps> = ({ currentProgress, secondsLeft }) => {
  const { t, i18n } = useTranslation();

  // Progress as percent with one fractional digit, e.g. 27.3%.
  const roundedPercent = Math.min(100, currentProgress * 100).toLocaleString(i18n.language, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });

  // Nicely format the remaining time.
  let prettyTime: string | null;
  if (secondsLeft === null) {
    prettyTime = null;
  } else if (secondsLeft < 4) {
    prettyTime = t("steps.finish.upload.time.a-few-seconds");
  } else if (secondsLeft < 45) {
    prettyTime = `${secondsLeft} ${t("steps.finish.upload.time.seconds")}`;
  } else if (secondsLeft < 90) {
    prettyTime = t("steps.finish.upload.time.a-minute");
  } else if (secondsLeft < 45 * 60) {
    prettyTime = `${Math.round(secondsLeft / 60)} ${t("steps.finish.upload.time.minutes")}`;
  } else if (secondsLeft < 90 * 60) {
    prettyTime = t("steps.finish.upload.time.an-hour");
  } else if (secondsLeft < 24 * 60 * 60) {
    prettyTime = `${Math.round(secondsLeft / (60 * 60))} ${t("steps.finish.upload.time.hours")}`;
  } else {
    prettyTime = null;
  }

  return (
    <GreyInnerBox>
      {/* Heading */}
      <div css={{ fontWeight: 700 }}>{t("steps.finish.upload.currently-uploading")}</div>

      {/* Progress bar */}
      <div css={{
        marginTop: 16,
        marginBottom: 8,
        height: 6,
        borderRadius: 3,
        backgroundColor: COLORS.neutral05,
        overflow: "hidden",
      }}>
        <div css={{
          width: `${currentProgress * 100}%`,
          height: "100%",
          backgroundColor: COLORS.accent5,
        }}/>
      </div>

      {/* Percent and time estimation */}
      <div css={{ display: "flex" }}>
        <div>{roundedPercent}%</div>
        <div css={{ flex: 1 }} />
        <div>
          {prettyTime && <Trans i18nKey="steps.finish.upload.time.left">
            {{ time: prettyTime }} left
          </Trans>}
        </div>
      </div>
    </GreyInnerBox>
  );
};

/** Shown if the upload was successful. A big checkmark and a text. */
const UploadSuccess = () => {
  const { t } = useTranslation();

  return (
    <GreyInnerBox>
      <div css={{ fontWeight: 700 }}>{t("steps.finish.upload.complete")}</div>
      <div css={{
        fontSize: 50,
        margin: 24,
        lineHeight: 0,
        color: COLORS.accent5,
      }}>
        <LuCheckCircle2 />
      </div>
      <div>{t("steps.finish.upload.complete-explanation")}</div>
    </GreyInnerBox>
  );
};

const GreyInnerBox: React.FC<React.PropsWithChildren> = ({ children }) => (
  <div css={{
    backgroundColor: COLORS.neutral10,
    fontSize: 14,
    marginTop: 24,
    padding: 24,
    borderRadius: 6,
    textAlign: "center",
  }}>
    {children}
  </div>
);
