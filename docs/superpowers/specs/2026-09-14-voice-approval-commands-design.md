# Voice Approval Commands — Design

**Goal:** Make Quick Capture fully hands-free. Today, voice input only dictates into the text box — you still have to tap Parse, then tap Confirm/Cancel/Undo/Go per draft. This closes the loop: dictate → auto-parse after a pause → say "confirm"/"cancel"/"undo" → back to dictating, on repeat, until you stop the mic.

**Context:** Voice lives in [use-voice-capture.ts](../../../src/lib/quick-capture/use-voice-capture.ts) (a thin `useSyncExternalStore` wrapper) over [voice-capture-controller.ts](../../../src/lib/quick-capture/voice-capture-controller.ts) (the actual `SpeechRecognition` wrapper, `continuous: true` so it never stops listening on its own), consumed by [quick-capture-panel.tsx](../../../src/components/quick-capture/quick-capture-panel.tsx). One dictation can already produce multiple draft cards at once (`parseCommand` splits on clauses like "and").

---

## 1. `matchApprovalCommand` — a pure keyword matcher

New file `src/lib/quick-capture/match-approval-command.ts`:

```ts
export type ApprovalCommand = "confirm" | "cancel" | "undo";

const CONFIRM_WORDS = new Set(["confirm", "yes", "yeah", "ok", "okay"]);
const CANCEL_WORDS = new Set(["cancel", "no", "nope"]);

export function matchApprovalCommand(text: string): ApprovalCommand | null {
  const firstWord = text.trim().toLowerCase().split(/\s+/)[0];
  if (!firstWord) return null;
  if (CONFIRM_WORDS.has(firstWord)) return "confirm";
  if (CANCEL_WORDS.has(firstWord)) return "cancel";
  if (firstWord === "undo") return "undo";
  return null;
}
```

Same shape as `computeReconciliation`/`computeShoppingAllowance` — no DOM, no Prisma, fully unit-testable in isolation.

## 2. Phase-scoped transcripts in the voice controller

`SpeechRecognition.onresult` fires with **all** results accumulated since the recognizer started (not just since the last event) — the existing controller sums `event.results[0..length]` on every call. For a hands-free loop, each phase (dictating a command, then listening for an approval word) needs its *own* clean transcript, or the next phase would see the previous phase's words too.

Rather than stopping/restarting the underlying `SpeechRecognition` instance between phases (racy — `stop()`/`start()` fire `onend` asynchronously), the controller tracks an index: `beginPhase()` pins a "start index" to however many results existed at that moment, and every `onresult` call only sums results from that index forward.

In `voice-capture-controller.ts`:

```ts
let phaseStartIndex = 0;
let lastResultsLength = 0;
// ...inside ensureRecognition()'s onresult:
instance.onresult = (event) => {
  lastResultsLength = event.results.length;
  let fullText = "";
  for (let i = phaseStartIndex; i < event.results.length; i++) {
    fullText += event.results[i][0].transcript;
  }
  onTranscript(fullText);
};
```

New controller method:

```ts
beginPhase() {
  phaseStartIndex = lastResultsLength;
},
```

Added to the `VoiceCaptureController` interface, and passed through `use-voice-capture.ts`'s `VoiceCapture` type as `beginPhase: () => void`.

**Known limitation:** if `beginPhase()` is called while the most recent result is still interim (not yet finalized by the browser) and that same result then keeps growing in place, its continuation is missed until a new result entry appears. In practice this only matters if `beginPhase()` fires mid-utterance, which the design below avoids (it's only called right after a silence-triggered parse or a short, quickly-finalized approval word) — accepted as a v1 limitation rather than tracking interim/final boundaries.

## 3. The hands-free state machine (in `quick-capture-panel.tsx`)

A new `voiceMode: "dictating" | "approving"` state, always starting at `"dictating"` whenever the mic is turned on. Because `useVoiceCapture`'s callback is captured once at mount (existing lazy-`useState` pattern — see its own comment on why), the callback must only read **refs** and call **stable** functions (state setters, the imported server actions, `router`) — never the per-render `handleParse`/`handleConfirm`/etc. Two refs mirror state via `useEffect`: `modeRef` (from `voiceMode`) and `draftsRef` (from `drafts`).

**Dictating mode:** every transcript update calls `setText(text)` and resets a 1.5-second debounce timer. If no further speech arrives before it fires, it calls a self-contained `runParse(text)` (the voice-flow's own copy of what `handleParse` does — `parseQuickCaptureAction`, then `setDrafts`). If parsing fails or returns no drafts, it clears the text, calls `voice.beginPhase()`, and stays in `"dictating"`. Otherwise it stores the drafts, transitions to `"approving"`, clears the text, and calls `voice.beginPhase()`.

**Approving mode:** transcripts are checked against `matchApprovalCommand` only — never treated as new dictation (this keeps normal dictated sentences from ever misfiring a keyword match, since keyword-interception simply doesn't happen in dictating mode). A match:
- **`confirm`** — calls `confirmQuickCaptureDraftAction` for every currently-pending, confirmable draft in `draftsRef.current` (skipping ones with an open clarification question or a `question` intent, same eligibility the Confirm button already uses) **and** triggers the `router.push` for any pending `navigate` draft (voice "confirm" doubles as its "Go").
- **`cancel`** — removes every pending confirmable draft, and dismisses any pending `navigate` draft, the same way tapping Cancel/nothing does today.
- **`undo`** — calls `undoQuickCaptureAction` for every draft currently showing an Undo link (`status === "confirmed"`, not `transaction_delete`).

After any of the three, it clears the text, calls `voice.beginPhase()`, and returns to `"dictating"` — closing the loop. No keyword is recognized during dictating mode (including "undo"): once a new dictation round begins, undoing a previous batch's transaction goes back to tapping its Undo link manually, which remains available exactly as it does today (draft cards aren't cleared by any of this — `setDrafts` behaves the same as the existing manual handlers, just applied to every eligible entry instead of one).

A small status line in the dialog reflects the current mode (e.g. "Listening — say your command" vs. "Listening — say confirm, cancel, or undo") whenever `voice.listening` is true, so the hands-free state isn't invisible.

## 4. Non-goals

- No changes to the deterministic parser, `execute.ts`, or `answer-question.ts` — this is purely a client-side orchestration layer on top of the already-complete pipeline.
- No new server actions — reuses `parseQuickCaptureAction`, `confirmQuickCaptureDraftAction`, `undoQuickCaptureAction` as-is.
- No configurable pause duration in this pass — 1.5s is a fixed constant; easy to tune later if it feels wrong in practice.
- Manual mouse/keyboard control (typing, clicking Parse/Confirm/Cancel/Undo/Go) is untouched and keeps working exactly as today, voice or not.

## 5. Testing

- `match-approval-command.test.ts` — pure unit tests, all keyword variants plus the "not a command" case.
- `voice-capture-controller.test.ts` — new cases for `beginPhase()`: a result after `beginPhase()` only reflects speech from that point forward, and `beginPhase()` before any `onresult` is a no-op that doesn't throw.
- The panel's hands-free orchestration (mode transitions, debounce, refs) is React-component logic layered over browser Speech APIs — consistent with the rest of the codebase, this isn't unit-tested directly (no e2e/UI tests exist for quick-capture today either); the pure/testable seams (`matchApprovalCommand`, `beginPhase`) carry the test coverage.
