export type VoiceCaptureErrorCode = "not-allowed" | "no-speech" | "other";

export type VoiceCaptureState = {
  listening: boolean;
  error: VoiceCaptureErrorCode | null;
};

export type VoiceCaptureController = {
  isSupported(): boolean;
  getState(): VoiceCaptureState;
  getServerState(): VoiceCaptureState;
  subscribe(listener: (state: VoiceCaptureState) => void): () => void;
  start(): void;
  stop(): void;
  beginPhase(): void;
};

const SERVER_STATE: VoiceCaptureState = { listening: false, error: null };

function getRecognitionCtor() {
  return globalThis.SpeechRecognition ?? globalThis.webkitSpeechRecognition;
}

function mapErrorCode(rawError: string): VoiceCaptureErrorCode {
  if (rawError === "not-allowed" || rawError === "permission-denied") return "not-allowed";
  if (rawError === "no-speech") return "no-speech";
  return "other";
}

export function createVoiceCaptureController(onTranscript: (text: string) => void): VoiceCaptureController {
  let recognition: InstanceType<NonNullable<ReturnType<typeof getRecognitionCtor>>> | null = null;
  let state: VoiceCaptureState = { listening: false, error: null };
  const listeners = new Set<(state: VoiceCaptureState) => void>();
  // Every onresult call replays ALL results since the recognizer started,
  // not just what's new. phaseStartIndex lets beginPhase() mark "only sum
  // from here on" so each turn of the hands-free loop (dictate, then
  // listen for an approval word) gets its own clean transcript instead of
  // replaying the previous turn's words too.
  let phaseStartIndex = 0;
  let lastResultsLength = 0;

  function setState(next: VoiceCaptureState) {
    state = next;
    for (const listener of listeners) listener(state);
  }

  function ensureRecognition() {
    if (recognition) return recognition;
    const Ctor = getRecognitionCtor();
    if (!Ctor) return null;
    const instance = new Ctor();
    instance.continuous = true;
    instance.interimResults = true;
    instance.lang = "en-US";
    instance.onresult = (event) => {
      lastResultsLength = event.results.length;
      let fullText = "";
      for (let i = phaseStartIndex; i < event.results.length; i++) {
        fullText += event.results[i][0].transcript;
      }
      onTranscript(fullText);
    };
    instance.onerror = (event) => {
      setState({ listening: false, error: mapErrorCode(event.error) });
    };
    instance.onend = () => {
      setState({ ...state, listening: false });
    };
    recognition = instance;
    return recognition;
  }

  return {
    isSupported() {
      return getRecognitionCtor() !== undefined;
    },
    getState() {
      return state;
    },
    getServerState() {
      return SERVER_STATE;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    start() {
      if (state.listening) return;
      const instance = ensureRecognition();
      if (!instance) return;
      setState({ listening: true, error: null });
      instance.start();
    },
    stop() {
      recognition?.stop();
    },
    beginPhase() {
      phaseStartIndex = lastResultsLength;
    },
  };
}
