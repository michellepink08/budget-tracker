"use client";

import { useState, useSyncExternalStore } from "react";
import {
  createVoiceCaptureController,
  type VoiceCaptureErrorCode,
} from "@/lib/quick-capture/voice-capture-controller";

export type VoiceCapture = {
  supported: boolean;
  listening: boolean;
  error: VoiceCaptureErrorCode | null;
  start: () => void;
  stop: () => void;
  beginPhase: () => void;
};

// One controller per hook instance, created lazily via useState's
// initializer (not useRef — a strict eslint rule here forbids reading
// ref.current anywhere but the init-check itself) so it's built once, on
// first render, and never depends on an effect running first.
export function useVoiceCapture(onTranscript: (text: string) => void): VoiceCapture {
  const [controller] = useState(() => createVoiceCaptureController(onTranscript));

  const state = useSyncExternalStore(controller.subscribe, controller.getState, controller.getServerState);

  return {
    supported: controller.isSupported(),
    listening: state.listening,
    error: state.error,
    start: controller.start,
    stop: controller.stop,
    beginPhase: controller.beginPhase,
  };
}
