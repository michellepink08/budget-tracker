# Quick Capture Voice Transcription — Design

**Status:** Approved by user, 2026-09-13

## Goal

Let the user speak a Quick Capture command instead of typing it, per the original spec: "Use browser speech recognition when available, with a graceful typed-input fallback... Show the live transcript. Let me edit the transcript before processing. Never save audio. Handle denied microphone permission clearly. Do not automatically commit a transaction after voice recognition. Voice and typed commands must use the same parsing and confirmation workflow."

## Context

`QuickCapturePanel` (`src/components/quick-capture/quick-capture-panel.tsx`) already has a single text `Input` feeding `parseQuickCaptureAction` → preview cards → `confirmQuickCaptureDraftAction`/`undoQuickCaptureAction`. Voice input only needs to get text into that same `Input`'s state — nothing downstream of parsing changes.

## Approach

Add a `useVoiceCapture()` hook wrapping the browser `SpeechRecognition` API (`window.SpeechRecognition ?? window.webkitSpeechRecognition`), and a mic button in `QuickCapturePanel` that uses it to drive the existing `text` state.

**Why this shape, not alternatives considered:**
- *Alternative: a separate voice-only modal/view.* Rejected — the spec explicitly wants voice and typed to "use the same parsing and confirmation workflow," and a second surface risks drifting from the first. Feeding the same `Input` state guarantees they can never diverge.
- *Alternative: auto-submit (call `handleParse()`) when recognition ends.* Rejected — spec explicitly forbids auto-committing after voice recognition; user must still press Parse (then Confirm), exactly like typed input.

### `src/lib/quick-capture/use-voice-capture.ts` (new)

A hook, not a component, so it's independently testable and keeps `QuickCapturePanel` from growing a second responsibility.

```ts
export type VoiceCaptureState = {
  supported: boolean;
  listening: boolean;
  error: "not-allowed" | "no-speech" | "other" | null;
  start: () => void;
  stop: () => void;
};

export function useVoiceCapture(onTranscript: (text: string) => void): VoiceCaptureState
```

- `supported`: computed once from whether `SpeechRecognition`/`webkitSpeechRecognition` exists on `window` (checked lazily inside the hook body on first render via `typeof window !== "undefined"`, not a `useEffect` — this is a plain read of an immutable browser capability, not state that needs syncing).
- Internally holds one `SpeechRecognition` instance in a `useRef`, created lazily on first `start()` call (not at mount) so it's never constructed on unsupported browsers or before the user opts in.
- `continuous = true`, `interimResults = true`, `lang = "en-US"` (the app has no i18n; matches existing English-only demo data/UI).
- `onresult`: concatenates all results' transcripts (interim + final) into one string and calls `onTranscript(fullText)` directly from inside the event handler — never via an effect, so there is no `set-state-in-effect` risk since the state update is triggered by a browser event callback, not a React effect reacting to a dependency.
- `onerror`: maps `event.error === "not-allowed"` (or `"not-allowed"`'s sibling `"permission-denied"` on older engines) to `"not-allowed"`, `"no-speech"` to `"no-speech"`, anything else to `"other"`; sets internal `listening` to `false`.
- `onend`: sets internal `listening` to `false` (covers both manual `stop()` and the browser's own timeout/silence auto-stop).
- `start()`: clears any previous `error`, calls `.start()` on the ref'd instance (constructing it first if this is the very first call), sets `listening = true`.
- `stop()`: calls `.stop()` on the instance if one exists; does nothing if never started (no-op, not an error).
- The hook's own `listening`/`error` are plain `useState` set only from these event callbacks/action functions — never from an effect — so no lint conflict.

No audio is ever stored: the Web Speech API only ever exposes recognized text to page JavaScript, never a raw audio buffer, so there is nothing to accidentally persist even if we wanted to.

### `src/components/quick-capture/quick-capture-panel.tsx` (modify)

- Import and call `useVoiceCapture(setText)` — every transcript update flows straight into the same `text` state the typed `Input` already uses and the `Parse` button already reads.
- Render a mic `Button` next to the existing `Input`, only when `voice.supported` is true:
  - Icon: `Mic` (lucide-react) normally, `MicOff` while `voice.listening` (click toggles `stop()`/`start()`).
  - `aria-label`: "Start voice input" / "Stop voice input".
  - Disabled while `parsing` (matches the existing `Parse` button's disabled condition), so a Parse-in-flight can't be interrupted by new speech overwriting `text`.
- Render `voice.error` as inline text under the input, reusing the same `text-sm text-destructive` style as `parseError`, with copy: not-allowed → "Microphone access was denied. You can still type your command."; no-speech → "Didn't catch that — try again or type instead."; other → "Voice input isn't working right now — please type instead."
- Reset: `handleOpenChange(false)` (already the single place local state resets on close) also calls `voice.stop()`, so a still-listening mic doesn't keep running after the dialog closes.
- No change to `handleParse`, `handleConfirm`, `handleUndo`, `handleCancel`, or `summarize()` — voice only ever populates `text`, exactly as if the user had typed it.

### Global type declarations

The DOM lib type definitions for `SpeechRecognition` are inconsistently available across TS/DOM lib versions and browser-vendor prefixes. Add a minimal ambient declaration in `src/lib/quick-capture/use-voice-capture.ts` (or a co-located `speech-recognition.d.ts` if the inline approach causes conflicts) covering only the members actually used: `start()`, `stop()`, `continuous`, `interimResults`, `lang`, `onresult`, `onerror`, `onend`, and the `event.results`/`event.error` shapes read above — not a full spec-accurate typing, since only this narrow surface is used.

## Data flow

```
User taps mic → start() → SpeechRecognition begins
  → onresult fires repeatedly → onTranscript(text) → setText(text) → Input shows live transcript
User taps mic again (or pauses long enough) → stop()/onend → listening=false, transcript stays in Input
User edits the transcript by typing, same as any other text (Input is uncontrolled by voice once done)
User taps Parse → identical to typed flow from here on
```

## Testing

- `use-voice-capture.test.ts`: mock `window.SpeechRecognition` as a fake class capturing the instance and letting the test manually invoke `onresult`/`onerror`/`onend`. Cases:
  - `supported` is `false` when neither global exists.
  - `start()` constructs the recognizer once (idempotent across repeated `start()` calls while already listening — a second call does not construct a second instance) and calls `.start()`.
  - `onresult` firing calls `onTranscript` with the concatenated transcript text.
  - `onerror` with `"not-allowed"` sets `error` to `"not-allowed"` and `listening` to `false`.
  - `onend` sets `listening` to `false`.
  - `stop()` calls `.stop()` on the existing instance; calling `stop()` before any `start()` does not throw.
- No new tests for `QuickCapturePanel` itself beyond what Phase 2 already covers — the mic button is presentational wiring onto an already-tested `text`/`Parse` flow; manual live verification (below) covers the integration.
- Manual verification on the live deployment (Chrome, which supports `webkitSpeechRecognition`): open Quick Capture, tap mic, speak a command, confirm the transcript appears live and is editable, tap mic again to stop, Parse, confirm identical preview/confirm behavior to typed input. Also verify: denying the mic permission prompt shows the not-allowed message and typed input still works; on a browser/engine without support (or by stubbing `window.SpeechRecognition = undefined` via devtools) the mic button doesn't render at all.

## Out of scope

- No language selection — English only, matching the rest of the app.
- No continuous background listening / wake-word.
- No server-side speech-to-text fallback for unsupported browsers — typed input is the fallback, per spec.
- No persistence of transcripts beyond what's already in the `text` input (no separate voice history/log).
