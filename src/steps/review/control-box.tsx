import React, { RefObject, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { ProtoButton, WithTooltip, notNullish, useColorScheme } from "@opencast/appkit";
import { FiPause, FiPlay } from "react-icons/fi";

import { useStudioState, useDispatch, Dispatcher } from "../../studio-state";
import { useSettings } from "../../settings";
import CutHereIcon from "./cut-here-icon.svg";
import CutMarkerIcon from "./cut-marker.svg";
import { COLORS, focusStyle } from "../../util";
import { ALMOST_ZERO } from ".";
import { PreviewHandle } from "./preview";
import { SHORTCUTS, ShortcutKeys, useShortcut, useShowAvailableShortcuts } from "../../shortcuts";


type SharedProps = {
  previewController: React.RefObject<PreviewHandle>;
  currentTime: number;
};

export const ControlBox: React.FC<SharedProps> = ({ previewController, currentTime }) => {
  const { i18n } = useTranslation();
  const duration = previewController.current?.duration;
  const { isHighContrast } = useColorScheme();

  return (
    <div css={{
      backgroundColor: COLORS.neutral05,
      borderRadius: 8,
      padding: 16,
      boxShadow: isHighContrast ? "none" : "0 4px 4px var(--shadow-color)",
      display: "flex",
      flexDirection: "column",
      gap: 12,
    }}>
      <Controls {...{ previewController, currentTime }} />
      <div css={{ textAlign: "center", color: COLORS.neutral70 }}>
        {formatTime(currentTime, duration, i18n.language)}
        /
        {formatTime(duration, duration, i18n.language)}
      </div>
      <Scrubber {...{ previewController, currentTime }} />
    </div>
  );
};

const formatTime = (
  seconds: number | undefined,
  totalDuration: number | undefined,
  lang: string,
): string => {
  const MINUTE = 60;
  const HOUR = 60 * MINUTE;

  if (seconds === undefined) {
    return "--:--";
  }

  const secondsPart = seconds % 60;
  const minutesPart = Math.floor(seconds / MINUTE) % 60;
  const hoursPart = Math.floor(seconds / HOUR);

  const secondsFormatted = secondsPart.toLocaleString(lang, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });

  const lowerPart = `${minutesPart <= 9 ? "0" : ""}${minutesPart}`
    + `:${secondsPart <= 9 ? "0" : ""}${secondsFormatted}`;

  return (totalDuration && totalDuration >= HOUR)
    ? `${hoursPart}:${lowerPart}`
    : lowerPart;
};

const Scrubber: React.FC<SharedProps> = ({ previewController, currentTime }) => {
  const duration = previewController.current?.duration || Infinity;
  const settings = useSettings();
  const dispatch = useDispatch();
  const { start, end } = useStudioState();
  const ref = useRef<HTMLDivElement>(null);
  const { isHighContrast } = useColorScheme();

  const setTime = (mouseEvent: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
    const rect = mouseEvent.currentTarget.getBoundingClientRect();
    const x = mouseEvent.clientX - rect.x;
    let progress = x / rect.width;
    if (progress < 0) {
      progress = 0;
    } else if (progress > 1) {
      progress = 1;
    }

    if (previewController.current) {
      previewController.current.currentTime = progress * duration;
    }
  };

  const cutStyle = {
    position: "absolute",
    backgroundColor: COLORS.danger1,
    height: "var(--scrubber-height)",
    borderRadius: "var(--scrubber-border-radius)",
    boxSizing: "content-box",
    background: "repeating-linear-gradient(45deg,"
      + `${COLORS.danger2}, ${COLORS.danger2} 4px,`
      + `${COLORS.danger1} 4px, ${COLORS.danger1} 8px)`,
  } as const;

  return (
    <div css={{ padding: 4 }}>
      <div ref={ref} css={{
        "--scrubber-border-radius": "3px",
        "--scrubber-height": "6px",
        "@media not (any-pointer: fine)": {
          "--scrubber-border-radius": "6px",
          "--scrubber-height": "12px",
        },

        position: "relative",
        backgroundColor: COLORS.accent4,
        width: "100%",
        height: "var(--scrubber-height)",
        borderRadius: "var(--scrubber-border-radius)",
      }}>
        {/* An overlay that extends further above and below the parent for easier clicking. */}
        <div
          onClick={e => setTime(e)}
          css={{
            position: "absolute",
            width: "100%",
            cursor: "pointer",
            zIndex: 5,
            top: -6,
            bottom: -6,
          }}
        >
          {/* The playhead */}
          <Draggable
            scrubberRef={ref}
            previewController={previewController}
            initialTime={currentTime}
            onDrag={time => notNullish(previewController.current).currentTime = time}
          >
            <div css={{
              width: 16,
              height: 16,
              "@media not (any-pointer: fine)": {
                width: 24,
                height: 24,
              },
              borderRadius: "50%",
              backgroundColor: COLORS.neutral05,
              border: `1px solid ${COLORS.neutral40}`,
            }}/>
          </Draggable>
        </div>

        {/* The two "deleted" areas */}
        {(start != null && start > 0) && <div css={{
          left: 0,
          borderRight: "2px solid black",
          width: `${(start / duration) * 100}%`,
          ...cutStyle,
        }} />}
        {(end != null && end < duration) && <div css={{
          right: 0,
          borderLeft: "2px solid black",
          width: `${((duration - end) / duration) * 100}%`,
          ...cutStyle,
          backgroundPosition: "right",
          backgroundSize: "100vw",
        }} />}

        {/* The two trim markers */}
        {settings.review?.disableCutting || <>
          <Draggable
            scrubberRef={ref}
            previewController={previewController}
            initialTime={start ?? 0}
            clamp={time => Math.min(time, end ?? duration)}
            onDrag={time => dispatch({ type: "UPDATE_START", time })}
          ><CutMarker side="left" isHighContrast={isHighContrast} /></Draggable>
          <Draggable
            scrubberRef={ref}
            previewController={previewController}
            initialTime={end ?? duration}
            clamp={time => Math.max(time, start ?? 0)}
            onDrag={time => dispatch({ type: "UPDATE_END", time })}
          ><CutMarker side="right" isHighContrast={isHighContrast} /></Draggable>
        </>}

        {/* The play progress bar, overlaying darkening everything behind. */}
        <div css={{
          position: "absolute",
          left: 0,
          width: `${(currentTime / duration) * 100}%`,
          backdropFilter: "brightness(0.75)",
          height: "var(--scrubber-height)",
          borderRadius: "var(--scrubber-border-radius)",
        }} />
      </div>
    </div>
  );
};

type CutMarkerProps = {
  side: "left" | "right";
  isHighContrast: boolean;
};

const CutMarker: React.FC<CutMarkerProps> = ({ side, isHighContrast }) => (
  <div css={{
    width: 14,
    height: 20,
    "@media not (any-pointer: fine)": {
      height: 24,
    },
    backgroundColor: COLORS.neutral05,
    color: COLORS.neutral70,
    border: `1px solid ${COLORS.neutral40}`,
    borderRadius: 4,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: isHighContrast ? "none" : "0 1px 2px var(--shadow-color)",
  }}>
    <CutMarkerIcon css={{
      transform: `scale(1.2) ${side == "right" ? "scaleX(-1)" : ""}`,
    }} />
  </div>
);

type DraggableProps = React.PropsWithChildren<{
  previewController: RefObject<PreviewHandle>;
  scrubberRef: RefObject<HTMLDivElement>;
  initialTime: number;

  /** Called on every mouse move with the updated value */
  onDrag?: (time: number) => void;

  /**
   * Called on every mouse move. The calculate time is passed as argument and
   * the function can modify it somehow, i.e. clamp it to a range. Called
   * before `onDrag`.
   */
  clamp?: (time: number) => number;
}>;

/**
 * Makes the given `children` draggable, letting the user adjust its x position
 * inside the scrubber.
 */
const Draggable: React.FC<DraggableProps> = ({
  previewController,
  scrubberRef,
  initialTime,
  onDrag,
  clamp = t => t,
  children,
}) => {
  const duration = previewController.current?.duration || Infinity;

  const initialPos = initialTime / duration;
  const pos = useRef<number>(initialPos);
  const scrubberRect = useRef<DOMRect>();
  const ref = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  useEffect(() => {
    const onMouseUp = () => {
      if (isDragging.current) {
        isDragging.current = false;
        onDrag?.(pos.current * duration);

        // Reset the element style so that the `left` value from the class CSS
        // can take over again.
        notNullish(ref.current).style.left = "";
      }
    };
    const onMouseMove = (e: MouseEvent) => {
      onMove(e.pageX);
    };
    const onMove = (pageX: number) => {
      if (isDragging.current) {
        const rect = notNullish(scrubberRect.current);
        const percentage = Math.min(1.0, Math.max(0.0, (pageX - rect.left) / rect.width));
        pos.current = clamp(duration * percentage) / duration;
        onDrag?.(pos.current * duration);

        // We set the left value here directly instead of waiting for the React
        // state change to trickle through. This actually leads to less input
        // delay and a smoother dragging.
        notNullish(ref.current).style.left = `${pos.current * 100}%`;
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        onMove(e.touches[0].pageX);
      }
    };

    document.addEventListener("mouseup", onMouseUp);
    document.addEventListener("touchend", onMouseUp);
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("touchmove", onTouchMove);

    return () => {
      document.removeEventListener("mouseup", onMouseUp);
      document.removeEventListener("touchend", onMouseUp);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("touchmove", onTouchMove);
    };
  });

  return (
    <div
      ref={ref}
      onMouseDown={() => {
        isDragging.current = true;
        scrubberRect.current = notNullish(scrubberRef.current).getBoundingClientRect();
      }}
      onTouchStart={() => {
        console.log("TOUCH START");
        isDragging.current = true;
        scrubberRect.current = notNullish(scrubberRef.current).getBoundingClientRect();
      }}
      css={{
        position: "absolute",
        zIndex: 10,
        left: `${initialPos * 100}%`,
        cursor: "grab",
        userSelect: "none",
        top: "50%",
        transform: "translateY(-50%) translateX(-50%)",
        padding: "8px 4px", // To make grabbing it easier
      }}
    >
      {children}
    </div>
  );
};

const Controls: React.FC<SharedProps> = ({ currentTime, previewController }) => {
  const { start, end } = useStudioState();
  const recordingDispatch = useDispatch();
  const settings = useSettings();
  const { t } = useTranslation();

  const togglePlayPause = () => {
    const controller = previewController.current;
    if (controller) {
      if (controller.isPlaying) {
        controller.pause();
      } else if (controller.isReadyToPlay) {
        controller.play();
      }
    }
  };

  useShortcut(SHORTCUTS.review.playPause, togglePlayPause, {
    ignoreEventWhen: e => e.code === "Space" && e.target instanceof HTMLButtonElement,
  });
  const showShortcuts = useShowAvailableShortcuts();
  const { isHighContrast } = useColorScheme();

  const isPlaying = previewController.current?.isPlaying;
  const label = t(`steps.review.${isPlaying ? "pause" : "play"}` as const);
  return (
    <div css={{
      display: "flex",
      gap: 16,
      justifyContent: "center",
      alignItems: "flex-end",
    }}>
      {/* Cut start */}
      {settings.review?.disableCutting || <CutControls
        marker="start"
        value={start}
        control={end}
        invariant={(start, end) => start < end}
        {...{ recordingDispatch, previewController, currentTime }}
      />}

      {/* Play/pause button */}
      <WithTooltip tooltip={label}>
        <ProtoButton
          aria-label={label}
          css={{
            backgroundColor: COLORS.accent5,
            color: isHighContrast ? COLORS.neutral05 : "white",
            border: "none",
            borderRadius: "50%",
            width: 48,
            height: 48,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            fontSize: 24,
            ...focusStyle({ offset: 1 }),
            "&:hover, :focus-visible": {
              backgroundColor: COLORS.accent6,
              ...isHighContrast && {
                backgroundColor: COLORS.neutral05,
                outline: `2px solid ${COLORS.accent4}`,
                color: COLORS.accent4,
              },
            },
          }}
          onClick={togglePlayPause}
          onMouseDown={e => e.preventDefault()}
        >
          {showShortcuts && (
            <div css={{
              position: "absolute",
              bottom: -20,
              padding: 2,
              borderRadius: 4,
              backgroundColor: COLORS.neutral05,
            }}><ShortcutKeys shortcut={SHORTCUTS.review.playPause.split(";")[0]} /></div>
          )}
          {isPlaying ? <FiPause /> : <FiPlay css={{ marginLeft: 3 }} />}
        </ProtoButton>
      </WithTooltip>

      {/* Cut end */}
      {settings.review?.disableCutting || <CutControls
        marker="end"
        value={end}
        control={start}
        invariant={(end, start) => start < end}
        {...{ recordingDispatch, previewController, currentTime }}
      />}
    </div>
  );
};

type CutControlsProps = SharedProps & {
  marker: "start" | "end";
  value: number | null;
  control: number | null;
  invariant: (self: number, control: number) => boolean;
  recordingDispatch: Dispatcher;
};

const CutControls: React.FC<CutControlsProps> = (
  { marker, value, control, invariant, currentTime, previewController, recordingDispatch },
) => {
  const { t, i18n } = useTranslation();
  const { isHighContrast } = useColorScheme();

  const disabled = currentTime <= ALMOST_ZERO
    || (previewController.current && currentTime >= previewController.current.duration)
    || (control != null && !invariant(currentTime, control));

  const cut = () => {
    if (!previewController.current) {
      return;
    }

    let value = previewController.current.currentTime;
    // We disable the buttons when the generated values would be invalid,
    // but we rely on `timeupdate` events for that, which are not guaranteed
    // to be timely, so we still have to check the invariant when actually
    // updating the state. Here we decided to just clamp the value appropriately.
    if (control != null && !invariant(value, control)) {
      value = control;
    }
    recordingDispatch({
      type: marker === "start" ? "UPDATE_START" : "UPDATE_END",
      time: value,
    });
  };

  const shortcut = SHORTCUTS.review[marker === "start" ? "cutLeft" : "cutRight"];
  useShortcut(shortcut, cut, { enabled: !disabled });
  useShortcut(
    SHORTCUTS.review[marker === "start" ? "removeCutLeft" : "removeCutRight"],
    () => recordingDispatch({
      type: marker === "start" ? "UPDATE_START" : "UPDATE_END",
      time: null,
    }),
  );
  const showShortcuts = useShowAvailableShortcuts();

  const timestamp = (
    <div css={{ minWidth: 68, textAlign: marker == "start" ? "right" : "left" }}>
      { value !== null && (
        <WithTooltip tooltip={t("steps.review.jump-to-cut-point")}>
          <ProtoButton
            css={{
              padding: "4px 0",
              color: COLORS.accent6,
            }}
            onClick={event => {
              event.preventDefault();
              if (previewController.current) {
                previewController.current.currentTime = value;
              }
            }}
            onMouseDown={e => e.preventDefault()}
          >
            {formatTime(value, value, i18n.language)}
          </ProtoButton>
        </WithTooltip>
      )}
    </div>
  );

  const cutButton = (
    <WithTooltip tooltip={t(`steps.review.set-${marker}`)}>
      <ProtoButton
        {...{ disabled }}
        aria-label={t(`steps.review.set-${marker}`)}
        onClick={cut}
        onMouseDown={e => e.preventDefault()}
        css={{
          lineHeight: 0,
          padding: "4px 8px",
          paddingTop: 4,
          borderRadius: 4,
          ...focusStyle(),
          "&:disabled": {
            opacity: 0.3,
          },
          "&:not(:disabled):hover": {
            backgroundColor: COLORS.neutral10,
            color: isHighContrast ? COLORS.accent4 : "inherit",
          },
        }}
      >
        <CutHereIcon css={{
          height: 36,
          width: 36,
          transform: marker === "end" ? "scaleX(-1)" : "",
        }} />
        {showShortcuts && !disabled && (
          <div css={{
            position: "absolute",
            bottom: -20,
            padding: 2,
            borderRadius: 4,
            backgroundColor: COLORS.neutral05,
          }}><ShortcutKeys shortcut={shortcut} /></div>
        )}
      </ProtoButton>
    </WithTooltip>
  );

  return marker === "start"
    ? <>{timestamp}{cutButton}</>
    : <>{cutButton}{timestamp}</>;
};
