import { Settings } from "./settings";
import { Dispatcher } from "./studio-state";


const mergeHeightConstraint = (
  maxHeight: number | undefined,
  videoConstraints: MediaTrackConstraints,
  fallbackIdeal?: number,
) => {
  const maxField = maxHeight && { max: maxHeight };
  const constraintIdeal = typeof videoConstraints?.height === "number"
    ? videoConstraints.height
    : videoConstraints.height?.ideal;
  const ideal = constraintIdeal ?? fallbackIdeal;
  const idealField = ideal && (maxHeight ? { ideal: Math.min(ideal, maxHeight) } : { ideal });

  return { height: { ...maxField, ...idealField } };
};

export async function startAudioCapture(dispatch: Dispatcher, deviceId?: ConstrainDOMString) {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: deviceId ? { deviceId } : true,
      video: false,
    });
    stream.getTracks().forEach(track => {
      track.onended = () => {
        dispatch({ type: "AUDIO_UNEXPECTED_END" });
      };
    });

    dispatch({ type: "SHARE_AUDIO", stream });
  } catch (err) {
    // TODO: there several types of exceptions; certainly we should differentiate here one day
    console.error("Error: ", err);

    dispatch({ type: "BLOCK_AUDIO" });
  }
}

export async function startDisplayCapture(
  dispatch: Dispatcher,
  settings: Settings,
  videoConstraints: MediaTrackConstraints = {},
) {
  const maxFps = settings.display?.maxFps
    ? { frameRate: { max: settings.display.maxFps } }
    : {};
  const height = mergeHeightConstraint(settings.display?.maxHeight, videoConstraints);

  const constraints = {
    video: {
      cursor: "always",
      ...maxFps,
      ...videoConstraints,
      ...height,
    },
    audio: true,
  };

  try {
    const stream = await navigator.mediaDevices.getDisplayMedia(constraints);
    stream.getTracks().forEach(track => {
      track.onended = () => {
        dispatch({ type: "DISPLAY_UNEXPECTED_END" });
      };
    });

    dispatch({ type: "SHARE_DISPLAY", stream });
  } catch (err) {
    // TODO: there 7 types of exceptions; certainly we should differentiate here one day
    console.error("Error: ", err);

    dispatch({ type: "BLOCK_DISPLAY" });
  }
}

export async function startUserCapture(
  dispatch: Dispatcher,
  settings: Settings,
  videoConstraints: MediaTrackConstraints,
) {
  const maxFps = settings.camera?.maxFps
    ? { frameRate: { max: settings.camera.maxFps } }
    : {};
  const height = mergeHeightConstraint(settings.camera?.maxHeight, videoConstraints, 1080);

  const constraints = {
    video: {
      facingMode: "user",
      ...videoConstraints,
      ...maxFps,
      ...height,
    },
    audio: false,
  };

  try {
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    stream.getTracks().forEach(track => {
      track.onended = () => {
        dispatch({ type: "USER_UNEXPECTED_END" });
      };
    });
    dispatch({ type: "SHARE_USER", stream });
  } catch (err) {
    // TODO: there 7 types of exceptions; certainly we should differentiate here one day
    console.error("Error: ", err);

    dispatch({ type: "BLOCK_USER" });
  }
}

// ----------------------------------------------------------------------------

export function stopCapture(
  { audioStream, displayStream, userStream }: {
    audioStream: MediaStream | null;
    displayStream: MediaStream | null;
    userStream: MediaStream | null;
  },
  dispatch: Dispatcher,
) {
  stopAudioCapture(audioStream, dispatch);
  stopDisplayCapture(displayStream, dispatch);
  stopUserCapture(userStream, dispatch);
}

export function stopAudioCapture(stream: MediaStream | null, dispatch: Dispatcher) {
  stream?.getTracks().forEach(track => track.stop());
  dispatch({ type: "UNSHARE_AUDIO" });
}

export function stopDisplayCapture(stream: MediaStream | null, dispatch: Dispatcher) {
  stream?.getTracks().forEach(track => track.stop());
  dispatch({ type: "UNSHARE_DISPLAY" });
}

export function stopUserCapture(stream: MediaStream | null, dispatch: Dispatcher) {
  stream?.getTracks().forEach(track => track.stop());
  dispatch({ type: "UNSHARE_USER" });
}
