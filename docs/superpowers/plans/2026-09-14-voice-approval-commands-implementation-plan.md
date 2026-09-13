# Voice Approval Commands Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Quick Capture fully hands-free — dictate, auto-parse after a pause, say "confirm"/"cancel"/"undo" instead of tapping buttons, then loop back to dictating.

**Architecture:** A pure keyword matcher (`matchApprovalCommand`), an index-based "phase" boundary added to the existing `SpeechRecognition` controller (`beginPhase()`), and a `dictating`/`approving` mode state machine added to `quick-capture-panel.tsx` that reuses the existing `parseQuickCaptureAction`/`confirmQuickCaptureDraftAction`/`undoQuickCaptureAction` server actions.

**Tech Stack:** Next.js App Router, TypeScript, React (`useState`/`useRef`/`useEffect`/`useSyncExternalStore`), Vitest.

**Spec:** `docs/superpowers/specs/2026-09-14-voice-approval-commands-design.md`

---

### Task 1: `matchApprovalCommand` — the pure keyword matcher

**Files:**
- Create: `src/lib/quick-capture/match-approval-command.ts`
- Test: `src/lib/quick-capture/match-approval-command.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import { matchApprovalCommand } from "@/lib/quick-capture/match-approval-command";

describe("matchApprovalCommand", () => {
  it.each(["confirm", "Confirm", "yes", "yeah", "ok", "okay"])("matches \"%s\" as confirm", (word) => {
    expect(matchApprovalCommand(word)).toBe("confirm");
  });

  it.each(["cancel", "no", "nope"])("matches \"%s\" as cancel", (word) => {
    expect(matchApprovalCommand(word)).toBe("cancel");
  });

  it("matches undo", () => {
    expect(matchApprovalCommand("undo")).toBe("undo");
  });

  it("matches only the first word of a longer phrase", () => {
    expect(matchApprovalCommand("confirm that please")).toBe("confirm");
  });

  it("returns null for text that isn't a command", () => {
    expect(matchApprovalCommand("paid 180 for food")).toBeNull();
  });

  it("returns null for empty or whitespace-only text", () => {
    expect(matchApprovalCommand("   ")).toBeNull();
    expect(matchApprovalCommand("")).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/quick-capture/match-approval-command.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/quick-capture/match-approval-command"`

- [ ] **Step 3: Implement**

```ts
export type ApprovalCommand = "confirm" | "cancel" | "undo";

const CONFIRM_WORDS = new Set(["confirm", "yes", "yeah", "ok", "okay"]);
const CANCEL_WORDS = new Set(["cancel", "no", "nope"]);

// Only the first word is checked — a real dictated sentence ("confirm
// that please") still counts, but this is deliberately narrow: it's only
// ever called while the panel is in "approving" mode (see the panel's
// state machine), never against ordinary dictation, so there's no risk
// of a normal sentence that happens to start with one of these words
// misfiring as a command.
export function matchApprovalCommand(text: string): ApprovalCommand | null {
  const firstWord = text.trim().toLowerCase().split(/\s+/)[0];
  if (!firstWord) return null;
  if (CONFIRM_WORDS.has(firstWord)) return "confirm";
  if (CANCEL_WORDS.has(firstWord)) return "cancel";
  if (firstWord === "undo") return "undo";
  return null;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/quick-capture/match-approval-command.test.ts`
Expected: PASS — 11 tests (6 `it.each` confirm + 3 `it.each` cancel expand to individual cases)

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add src/lib/quick-capture/match-approval-command.ts src/lib/quick-capture/match-approval-command.test.ts
git commit -m "feat(quick-capture): add matchApprovalCommand, a pure voice-keyword matcher

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Phase-scoped transcripts in the voice controller

**Files:**
- Modify: `src/lib/quick-capture/voice-capture-controller.ts`
- Test: `src/lib/quick-capture/voice-capture-controller.test.ts`

`SpeechRecognition.onresult` replays every result since the recognizer started. `beginPhase()` lets a caller mark "start summing from here" so each phase of the hands-free loop gets its own clean transcript, without racily stopping/restarting the underlying recognizer.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/quick-capture/voice-capture-controller.test.ts`, inside the existing `describe("createVoiceCaptureController", ...)` block (anywhere after the other `it(...)` calls, before the closing `});`):

```ts
  it("beginPhase() scopes future onresult calls to speech recognized from that point forward", () => {
    const instances = installFakeRecognition();
    const onTranscript = vi.fn();
    const controller = createVoiceCaptureController(onTranscript);
    controller.start();
    instances[0].onresult?.({ results: [{ 0: { transcript: "paid 180 for food" } }] });
    expect(onTranscript).toHaveBeenLastCalledWith("paid 180 for food");

    controller.beginPhase();
    instances[0].onresult?.({
      results: [{ 0: { transcript: "paid 180 for food" } }, { 0: { transcript: "confirm" } }],
    });
    expect(onTranscript).toHaveBeenLastCalledWith("confirm");
  });

  it("beginPhase() before any onresult does not throw", () => {
    installFakeRecognition();
    const controller = createVoiceCaptureController(() => {});
    expect(() => controller.beginPhase()).not.toThrow();
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/quick-capture/voice-capture-controller.test.ts`
Expected: FAIL — `controller.beginPhase is not a function`

- [ ] **Step 3: Implement**

In `src/lib/quick-capture/voice-capture-controller.ts`, change:

```ts
export type VoiceCaptureController = {
  isSupported(): boolean;
  getState(): VoiceCaptureState;
  getServerState(): VoiceCaptureState;
  subscribe(listener: (state: VoiceCaptureState) => void): () => void;
  start(): void;
  stop(): void;
};
```

to:

```ts
export type VoiceCaptureController = {
  isSupported(): boolean;
  getState(): VoiceCaptureState;
  getServerState(): VoiceCaptureState;
  subscribe(listener: (state: VoiceCaptureState) => void): () => void;
  start(): void;
  stop(): void;
  beginPhase(): void;
};
```

Change:

```ts
export function createVoiceCaptureController(onTranscript: (text: string) => void): VoiceCaptureController {
  let recognition: InstanceType<NonNullable<ReturnType<typeof getRecognitionCtor>>> | null = null;
  let state: VoiceCaptureState = { listening: false, error: null };
  const listeners = new Set<(state: VoiceCaptureState) => void>();
```

to:

```ts
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
```

Change:

```ts
    instance.onresult = (event) => {
      let fullText = "";
      for (let i = 0; i < event.results.length; i++) {
        fullText += event.results[i][0].transcript;
      }
      onTranscript(fullText);
    };
```

to:

```ts
    instance.onresult = (event) => {
      lastResultsLength = event.results.length;
      let fullText = "";
      for (let i = phaseStartIndex; i < event.results.length; i++) {
        fullText += event.results[i][0].transcript;
      }
      onTranscript(fullText);
    };
```

Change:

```ts
    stop() {
      recognition?.stop();
    },
  };
}
```

to:

```ts
    stop() {
      recognition?.stop();
    },
    beginPhase() {
      phaseStartIndex = lastResultsLength;
    },
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/quick-capture/voice-capture-controller.test.ts`
Expected: PASS — all tests, old and new

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add src/lib/quick-capture/voice-capture-controller.ts src/lib/quick-capture/voice-capture-controller.test.ts
git commit -m "feat(quick-capture): add beginPhase() for phase-scoped voice transcripts

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Expose `beginPhase` through the `useVoiceCapture` hook

**Files:**
- Modify: `src/lib/quick-capture/use-voice-capture.ts`

No test file exists for this hook today (it's a thin passthrough); verified via typecheck and the full suite.

- [ ] **Step 1: Widen the `VoiceCapture` type and return value**

In `src/lib/quick-capture/use-voice-capture.ts`, change:

```ts
export type VoiceCapture = {
  supported: boolean;
  listening: boolean;
  error: VoiceCaptureErrorCode | null;
  start: () => void;
  stop: () => void;
};
```

to:

```ts
export type VoiceCapture = {
  supported: boolean;
  listening: boolean;
  error: VoiceCaptureErrorCode | null;
  start: () => void;
  stop: () => void;
  beginPhase: () => void;
};
```

Change:

```ts
  return {
    supported: controller.isSupported(),
    listening: state.listening,
    error: state.error,
    start: controller.start,
    stop: controller.stop,
  };
}
```

to:

```ts
  return {
    supported: controller.isSupported(),
    listening: state.listening,
    error: state.error,
    start: controller.start,
    stop: controller.stop,
    beginPhase: controller.beginPhase,
  };
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Run the full suite**

Run: `npx vitest run`
Expected: all test files pass

- [ ] **Step 4: Commit**

```bash
git add src/lib/quick-capture/use-voice-capture.ts
git commit -m "feat(quick-capture): expose beginPhase through useVoiceCapture

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: The hands-free state machine in the Quick Capture panel

**Files:**
- Modify: `src/components/quick-capture/quick-capture-panel.tsx`

No test file exists for this component (no component tests exist anywhere in `quick-capture/` today); verified via typecheck, the full suite, and a production build. This is the only task in the plan touching this file's core logic — kept as one task because every piece (mode state, refs, the three "all pending" actions, and the transcript router) is one interlocking unit that only becomes meaningful together.

- [ ] **Step 1: Widen imports and add the pause constant**

Change:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Mic, MicOff } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  parseQuickCaptureAction,
  confirmQuickCaptureDraftAction,
  undoQuickCaptureAction,
} from "@/actions/quick-capture.actions";
import { useVoiceCapture } from "@/lib/quick-capture/use-voice-capture";
import type { CommandDraft } from "@/lib/quick-capture/types";
```

to:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Mic, MicOff } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  parseQuickCaptureAction,
  confirmQuickCaptureDraftAction,
  undoQuickCaptureAction,
} from "@/actions/quick-capture.actions";
import { useVoiceCapture } from "@/lib/quick-capture/use-voice-capture";
import { matchApprovalCommand } from "@/lib/quick-capture/match-approval-command";
import type { CommandDraft } from "@/lib/quick-capture/types";
```

Change:

```tsx
const EXAMPLES = [
  "Paid 180 for food using cash",
  "Transferred 1,000 from BPI to GCash",
  "Received 5,000 from Rei in BPI Savings",
];
```

to:

```tsx
const EXAMPLES = [
  "Paid 180 for food using cash",
  "Transferred 1,000 from BPI to GCash",
  "Received 5,000 from Rei in BPI Savings",
];

// How long to wait after the last recognized speech before auto-parsing
// in hands-free mode. A fixed constant for now — easy to retune later.
const VOICE_PAUSE_MS = 1500;
```

- [ ] **Step 2: Add mode state and the refs the frozen voice callback needs**

Change:

```tsx
  const router = useRouter();
  const [text, setText] = useState("");
  const [drafts, setDrafts] = useState<DraftState[] | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const voice = useVoiceCapture(setText);

  // Reset local state on close via the dialog's own open-change callback
  // (not an effect watching `open`) — resetting state directly inside an
  // effect body causes an extra cascading render.
  function handleOpenChange(next: boolean) {
    if (!next) {
      setText("");
      setDrafts(null);
      setParseError(null);
      voice.stop();
    }
    onOpenChange(next);
  }
```

to:

```tsx
  const router = useRouter();
  const [text, setText] = useState("");
  const [drafts, setDrafts] = useState<DraftState[] | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [voiceMode, setVoiceMode] = useState<"dictating" | "approving">("dictating");

  // useVoiceCapture's onTranscript callback is captured once at mount
  // (see that hook's own comment) — so handleVoiceTranscript below, and
  // everything it calls, must only ever touch refs and stable functions
  // (state setters, router.push, the imported server actions), never the
  // per-render handleParse/handleConfirm/etc. defined further down, which
  // would go stale forever. modeRef/draftsRef mirror state into refs for
  // exactly that reason; onOpenChange is safe to use directly because
  // both call sites (top-nav.tsx, side-nav.tsx) pass a raw useState
  // setter, which is itself stable across renders.
  const modeRef = useRef(voiceMode);
  useEffect(() => {
    modeRef.current = voiceMode;
  }, [voiceMode]);
  const draftsRef = useRef(drafts);
  useEffect(() => {
    draftsRef.current = drafts;
  }, [drafts]);
  const pauseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function runParse(currentText: string) {
    setParsing(true);
    setParseError(null);
    const result = await parseQuickCaptureAction(currentText);
    setParsing(false);
    if (!result.ok || result.drafts.length === 0) {
      if (!result.ok) setParseError(result.error);
      setVoiceMode("dictating");
      modeRef.current = "dictating";
      setText("");
      voice.beginPhase();
      return;
    }
    const newDrafts = result.drafts.map((draft) => ({ draft, status: "pending" as const }));
    setDrafts(newDrafts);
    draftsRef.current = newDrafts;
    setVoiceMode("approving");
    modeRef.current = "approving";
    setText("");
    voice.beginPhase();
  }

  async function confirmAllPending() {
    const current = draftsRef.current ?? [];
    for (let i = 0; i < current.length; i++) {
      const entry = current[i];
      if (entry.status !== "pending" || entry.draft.clarification) continue;
      if (entry.draft.intent === "question") continue;
      if (entry.draft.intent === "navigate") {
        handleOpenChange(false);
        router.push(entry.draft.route);
        return;
      }
      const result = await confirmQuickCaptureDraftAction(entry.draft);
      setDrafts((prev) =>
        prev!.map((d, idx) =>
          idx === i
            ? result.ok
              ? { ...d, status: "confirmed" as const, logId: result.logId }
              : { ...d, status: "error" as const, error: result.error }
            : d,
        ),
      );
    }
    setVoiceMode("dictating");
    modeRef.current = "dictating";
    setText("");
    voice.beginPhase();
  }

  function cancelAllPending() {
    setDrafts((prev) =>
      prev
        ? prev.filter((d) => d.status !== "pending" || d.draft.clarification || d.draft.intent === "question")
        : prev,
    );
    setVoiceMode("dictating");
    modeRef.current = "dictating";
    setText("");
    voice.beginPhase();
  }

  async function undoAllConfirmed() {
    const current = draftsRef.current ?? [];
    for (let i = 0; i < current.length; i++) {
      const entry = current[i];
      if (entry.status !== "confirmed" || entry.draft.intent === "transaction_delete" || !entry.logId) continue;
      await undoQuickCaptureAction(entry.logId);
      setDrafts((prev) =>
        prev!.map((d, idx) => (idx === i ? { ...d, status: "pending" as const, logId: undefined } : d)),
      );
    }
    setVoiceMode("dictating");
    modeRef.current = "dictating";
    setText("");
    voice.beginPhase();
  }

  function handleVoiceTranscript(transcript: string) {
    if (modeRef.current === "dictating") {
      setText(transcript);
      if (pauseTimerRef.current) clearTimeout(pauseTimerRef.current);
      pauseTimerRef.current = setTimeout(() => {
        runParse(transcript);
      }, VOICE_PAUSE_MS);
      return;
    }
    const command = matchApprovalCommand(transcript);
    if (command === "confirm") {
      confirmAllPending();
    } else if (command === "cancel") {
      cancelAllPending();
    } else if (command === "undo") {
      undoAllConfirmed();
    }
  }

  const voice = useVoiceCapture(handleVoiceTranscript);

  // Reset local state on close via the dialog's own open-change callback
  // (not an effect watching `open`) — resetting state directly inside an
  // effect body causes an extra cascading render.
  function handleOpenChange(next: boolean) {
    if (!next) {
      setText("");
      setDrafts(null);
      setParseError(null);
      setVoiceMode("dictating");
      if (pauseTimerRef.current) clearTimeout(pauseTimerRef.current);
      voice.stop();
    }
    onOpenChange(next);
  }
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Lint**

Run: `npx eslint src/components/quick-capture/quick-capture-panel.tsx`
Expected: no new errors (a `react-hooks/exhaustive-deps` warning, if one appears on the two mirroring effects, is expected and fine — mirroring the *entire* `voiceMode`/`drafts` value into a ref by design has no other dependency to list)

- [ ] **Step 5: Run the full suite**

Run: `npx vitest run`
Expected: all test files pass (this file has no tests of its own, but the change must not break anything it imports from)

- [ ] **Step 6: Commit**

```bash
git add src/components/quick-capture/quick-capture-panel.tsx
git commit -m "feat(quick-capture): add the hands-free dictate/auto-parse/voice-approve loop

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Status hint in the dialog

**Files:**
- Modify: `src/components/quick-capture/quick-capture-panel.tsx`

Surfaces the otherwise-invisible mode so hands-free use doesn't feel like the app went silent.

- [ ] **Step 1: Add the status line**

Change:

```tsx
          {voice.error && (
            <p className="text-sm text-destructive">
              {voice.error === "not-allowed"
                ? "Microphone access was denied. You can still type your command."
                : voice.error === "no-speech"
                  ? "Didn't catch that — try again or type instead."
                  : "Voice input isn't working right now — please type instead."}
            </p>
          )}

          {!drafts && (
```

to:

```tsx
          {voice.error && (
            <p className="text-sm text-destructive">
              {voice.error === "not-allowed"
                ? "Microphone access was denied. You can still type your command."
                : voice.error === "no-speech"
                  ? "Didn't catch that — try again or type instead."
                  : "Voice input isn't working right now — please type instead."}
            </p>
          )}

          {voice.listening && !voice.error && (
            <p className="text-xs text-muted-foreground">
              {voiceMode === "approving"
                ? "Listening — say confirm, cancel, or undo"
                : "Listening — say your command"}
            </p>
          )}

          {!drafts && (
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/components/quick-capture/quick-capture-panel.tsx
git commit -m "feat(quick-capture): show a listening/mode status line during voice capture

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: Full verification sweep

**Files:** none — verification only.

- [ ] **Step 1: Full test suite**

Run: `npx vitest run`
Expected: every test file passes

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Lint**

Run: `npx eslint src`
Expected: no new errors (the 4 pre-existing unrelated warnings from before this plan are fine)

- [ ] **Step 4: Production build**

Run: `npx next build`
Expected: succeeds

- [ ] **Step 5: No commit for this task — verification only.**
