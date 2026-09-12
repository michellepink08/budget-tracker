# Quick Capture Voice Transcription Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user speak a Quick Capture command via the browser's `SpeechRecognition` API, with a live editable transcript feeding the exact same typed-input/parse/confirm flow `QuickCapturePanel` already has.

**Architecture:** A plain, non-React `createVoiceCaptureController()` factory owns all `SpeechRecognition` wiring and exposes a small subscribable state object (`{ listening, error }`) — this is the fully unit-testable core, mirroring how the rest of `src/lib/quick-capture/` is pure and mocked-free of any browser/React runtime. A thin `useVoiceCapture()` hook wraps one controller instance per panel mount via `useSyncExternalStore` (the same hydration-safe subscription pattern already used in `src/components/nav/side-nav.tsx`), so there is no `set-state-in-effect` risk anywhere in this feature. `QuickCapturePanel` gets a mic button wired to the hook, writing straight into its existing `text` state — no changes to parsing, confirmation, or undo.

**Deviation from the design spec's testing section:** The spec sketched testing the hook directly by mocking `window.SpeechRecognition`. This project has no `jsdom`/`@testing-library/react` in its toolchain (`vitest.config.ts` runs `environment: "node"`, and no component or hook anywhere in the codebase has a test — `TopNav`, `SideNav`, `QuickCapturePanel` etc. are all manually verified only). Adding a browser test environment and a hook-testing library for one small hook would be a bigger toolchain change than this feature warrants. Instead, all the testable logic (recognition lifecycle, transcript concatenation, error mapping) lives in the plain `createVoiceCaptureController()` function, which has full automated test coverage exactly like every other file in `src/lib/quick-capture/`. The React hook itself (`use-voice-capture.ts`) is a few lines of wiring with no independent test, consistent with how every other hook-shaped or component-shaped file in this codebase is verified manually instead. This keeps the feature's actual decision logic under automated test while following the codebase's existing convention for UI-layer code.

**Tech Stack:** TypeScript, React 19 `useSyncExternalStore`, browser `SpeechRecognition`/`webkitSpeechRecognition` Web API, Vitest, lucide-react icons, existing shadcn/ui `Button`.

---

### Task 1: Ambient `SpeechRecognition` types

**Files:**
- Create: `src/lib/quick-capture/speech-recognition.d.ts`

- [ ] **Step 1: Write the minimal ambient declarations**

The DOM lib typings for `SpeechRecognition` aren't reliably present across TS/lib versions. Declare only the narrow surface this feature uses.

```ts
export {};

interface SpeechRecognitionResultLike {
  [index: number]: { transcript: string };
}

interface SpeechRecognitionEventLike extends Event {
  results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionErrorEventLike extends Event {
  error: string;
}

interface SpeechRecognitionLike extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/quick-capture/speech-recognition.d.ts
git commit -m "feat(quick-capture): add ambient SpeechRecognition types

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: `createVoiceCaptureController` (testable core)

**Files:**
- Create: `src/lib/quick-capture/voice-capture-controller.ts`
- Test: `src/lib/quick-capture/voice-capture-controller.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { createVoiceCaptureController } from "@/lib/quick-capture/voice-capture-controller";

class FakeRecognition extends EventTarget {
  continuous = false;
  interimResults = false;
  lang = "";
  onresult: ((event: { results: ArrayLike<{ 0: { transcript: string } }> }) => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn();
}

function installFakeRecognition() {
  const instances: FakeRecognition[] = [];
  (window as unknown as { SpeechRecognition: unknown }).SpeechRecognition = vi.fn(() => {
    const instance = new FakeRecognition();
    instances.push(instance);
    return instance;
  });
  return instances;
}

afterEach(() => {
  delete (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition;
  delete (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;
});

describe("createVoiceCaptureController", () => {
  it("reports unsupported when no recognition global exists", () => {
    const controller = createVoiceCaptureController(() => {});
    expect(controller.isSupported()).toBe(false);
  });

  it("reports supported when SpeechRecognition exists", () => {
    installFakeRecognition();
    const controller = createVoiceCaptureController(() => {});
    expect(controller.isSupported()).toBe(true);
  });

  it("constructs the recognizer lazily on first start(), not at creation", () => {
    const instances = installFakeRecognition();
    createVoiceCaptureController(() => {});
    expect(instances).toHaveLength(0);
  });

  it("start() constructs one instance and calls .start()", () => {
    const instances = installFakeRecognition();
    const controller = createVoiceCaptureController(() => {});
    controller.start();
    expect(instances).toHaveLength(1);
    expect(instances[0].start).toHaveBeenCalledOnce();
    expect(controller.getState().listening).toBe(true);
  });

  it("a second start() while already listening does not construct a second instance", () => {
    const instances = installFakeRecognition();
    const controller = createVoiceCaptureController(() => {});
    controller.start();
    controller.start();
    expect(instances).toHaveLength(1);
  });

  it("onresult concatenates transcript pieces and forwards the full text", () => {
    const instances = installFakeRecognition();
    const onTranscript = vi.fn();
    const controller = createVoiceCaptureController(onTranscript);
    controller.start();
    instances[0].onresult?.({ results: [{ 0: { transcript: "paid 180 " } }, { 0: { transcript: "for food" } }] });
    expect(onTranscript).toHaveBeenCalledWith("paid 180 for food");
  });

  it("onerror with not-allowed sets error and stops listening", () => {
    const instances = installFakeRecognition();
    const controller = createVoiceCaptureController(() => {});
    controller.start();
    instances[0].onerror?.({ error: "not-allowed" });
    expect(controller.getState()).toEqual({ listening: false, error: "not-allowed" });
  });

  it("onerror with no-speech maps to the no-speech error", () => {
    const instances = installFakeRecognition();
    const controller = createVoiceCaptureController(() => {});
    controller.start();
    instances[0].onerror?.({ error: "no-speech" });
    expect(controller.getState().error).toBe("no-speech");
  });

  it("onerror with an unrecognized code maps to other", () => {
    const instances = installFakeRecognition();
    const controller = createVoiceCaptureController(() => {});
    controller.start();
    instances[0].onerror?.({ error: "network" });
    expect(controller.getState().error).toBe("other");
  });

  it("onend sets listening to false", () => {
    const instances = installFakeRecognition();
    const controller = createVoiceCaptureController(() => {});
    controller.start();
    instances[0].onend?.();
    expect(controller.getState().listening).toBe(false);
  });

  it("start() clears a previous error", () => {
    const instances = installFakeRecognition();
    const controller = createVoiceCaptureController(() => {});
    controller.start();
    instances[0].onerror?.({ error: "no-speech" });
    controller.start();
    expect(controller.getState().error).toBeNull();
  });

  it("stop() calls .stop() on the existing instance", () => {
    const instances = installFakeRecognition();
    const controller = createVoiceCaptureController(() => {});
    controller.start();
    controller.stop();
    expect(instances[0].stop).toHaveBeenCalledOnce();
  });

  it("stop() before any start() does not throw", () => {
    installFakeRecognition();
    const controller = createVoiceCaptureController(() => {});
    expect(() => controller.stop()).not.toThrow();
  });

  it("subscribe notifies listeners on state changes and returns an unsubscribe function", () => {
    const instances = installFakeRecognition();
    const controller = createVoiceCaptureController(() => {});
    const listener = vi.fn();
    const unsubscribe = controller.subscribe(listener);
    controller.start();
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    instances[0].onend?.();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/quick-capture/voice-capture-controller.test.ts`
Expected: FAIL — `voice-capture-controller` module not found.

- [ ] **Step 3: Write the implementation**

```ts
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
};

const SERVER_STATE: VoiceCaptureState = { listening: false, error: null };

function getRecognitionCtor() {
  if (typeof window === "undefined") return undefined;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition;
}

function mapErrorCode(rawError: string): VoiceCaptureErrorCode {
  if (rawError === "not-allowed" || rawError === "permission-denied") return "not-allowed";
  if (rawError === "no-speech") return "no-speech";
  return "other";
}

export function createVoiceCaptureController(onTranscript: (text: string) => void): VoiceCaptureController {
  let recognition: ReturnType<NonNullable<ReturnType<typeof getRecognitionCtor>>> | null = null;
  let state: VoiceCaptureState = { listening: false, error: null };
  const listeners = new Set<(state: VoiceCaptureState) => void>();

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
      let fullText = "";
      for (let i = 0; i < event.results.length; i++) {
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
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/quick-capture/voice-capture-controller.test.ts`
Expected: PASS (14 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/quick-capture/voice-capture-controller.ts src/lib/quick-capture/voice-capture-controller.test.ts
git commit -m "feat(quick-capture): add voice capture controller

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: `useVoiceCapture` hook

**Files:**
- Create: `src/lib/quick-capture/use-voice-capture.ts`

No test file for this task — see the plan header's "Deviation" note: this is a thin React wiring layer with no logic beyond what Task 2 already covers, consistent with every other hook/component in this codebase having no test file.

- [ ] **Step 1: Write the hook**

```ts
"use client";

import { useState, useSyncExternalStore } from "react";
import { createVoiceCaptureController, type VoiceCaptureErrorCode } from "@/lib/quick-capture/voice-capture-controller";

export type VoiceCapture = {
  supported: boolean;
  listening: boolean;
  error: VoiceCaptureErrorCode | null;
  start: () => void;
  stop: () => void;
};

// One controller per hook instance, created lazily via useState's
// initializer (not useRef — this repo's react-hooks/refs lint rule forbids
// reading ref.current anywhere but the init-check itself, which would break
// every other use of the controller during render) so it's built once, on
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
  };
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/quick-capture/use-voice-capture.ts
git commit -m "feat(quick-capture): add useVoiceCapture hook

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Wire the mic button into `QuickCapturePanel`

**Files:**
- Modify: `src/components/quick-capture/quick-capture-panel.tsx`

- [ ] **Step 1: Import the hook and icons, call the hook, and extend `handleOpenChange`**

In the imports at the top, add:

```ts
import { Mic, MicOff } from "lucide-react";
import { useVoiceCapture } from "@/lib/quick-capture/use-voice-capture";
```

Inside `QuickCapturePanel`, right after the existing `useState` declarations, add:

```ts
const voice = useVoiceCapture(setText);
```

Change `handleOpenChange` to also stop any in-progress listening on close:

```ts
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

- [ ] **Step 2: Add the mic button next to the text input**

Replace the existing input row:

```tsx
<div className="flex gap-2">
  <Input
    autoFocus
    value={text}
    onChange={(e) => setText(e.target.value)}
    onKeyDown={(e) => {
      if (e.key === "Enter") handleParse();
    }}
    placeholder="Paid 180 for food using cash"
  />
  <Button type="button" onClick={handleParse} disabled={parsing || !text.trim()}>
    {parsing ? "..." : "Parse"}
  </Button>
</div>
```

with:

```tsx
<div className="flex gap-2">
  <Input
    autoFocus
    value={text}
    onChange={(e) => setText(e.target.value)}
    onKeyDown={(e) => {
      if (e.key === "Enter") handleParse();
    }}
    placeholder="Paid 180 for food using cash"
  />
  {voice.supported && (
    <Button
      type="button"
      variant="outline"
      size="icon"
      disabled={parsing}
      aria-label={voice.listening ? "Stop voice input" : "Start voice input"}
      onClick={() => (voice.listening ? voice.stop() : voice.start())}
    >
      {voice.listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
    </Button>
  )}
  <Button type="button" onClick={handleParse} disabled={parsing || !text.trim()}>
    {parsing ? "..." : "Parse"}
  </Button>
</div>
```

- [ ] **Step 3: Show the voice error message**

Directly below the existing `{parseError && ...}` line, add:

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
```

- [ ] **Step 4: Check the shadcn `Button` supports `size="icon"`**

Run: `Grep -n "icon" src/components/ui/button.tsx`
Expected: an `icon` size variant already exists (used elsewhere in the app, e.g. the collapse toggle style). If it does not exist, use `size="sm"` instead and drop the `size="icon"` reference in Step 2.

- [ ] **Step 5: Typecheck and lint**

Run: `npx tsc --noEmit && npx eslint src/components/quick-capture/quick-capture-panel.tsx`
Expected: no errors (pre-existing informational React-Compiler warnings elsewhere in the repo are fine, but this file should be clean).

- [ ] **Step 6: Commit**

```bash
git add src/components/quick-capture/quick-capture-panel.tsx
git commit -m "feat(quick-capture): add mic button for voice input

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Full verification and deploy

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass (297 existing + 14 new controller tests = 311), zero regressions.

- [ ] **Step 2: Typecheck, lint, and build the whole project**

Run: `npx tsc --noEmit && npx eslint . && npx next build`
Expected: no type errors, no new lint errors, successful build.

- [ ] **Step 3: Push to trigger a Vercel deploy**

```bash
git push
```

Wait for the Vercel deployment to go live (check via the project's Vercel dashboard/CLI as done in prior phases).

- [ ] **Step 4: Manually verify on the live deployment**

Using the browser tooling against the deployed app:
- Open Quick Capture (desktop sidebar button or `Ctrl/Cmd+K`); confirm a mic icon button appears next to the text input (Chrome supports `webkitSpeechRecognition`).
- Grant microphone permission when prompted (may require running this check via an interactive browser session where a real prompt can be granted, since it's a live user-permission gate — if the automated browser tool cannot grant OS/browser mic permission, note this limitation and instead verify via `javascript_tool`: stub `window.SpeechRecognition` to a fake implementation and confirm the UI reacts correctly to `onresult`/`onerror`/`onend` callbacks, then separately confirm real permission-prompt behavior manually if possible).
- Confirm tapping the mic toggles the icon to "stop" state and back.
- Confirm the input's text updates live as `onresult` fires (via the fake-recognition stub if real speech input isn't feasible in this environment) and remains editable afterward.
- Confirm Parse/Confirm/Undo behave identically to typed input — no auto-submit ever occurs after voice input stops.
- Confirm denying microphone permission (or stubbing an `onerror` with `"not-allowed"`) shows the expected inline message and typed input still works.
- Confirm closing the dialog while "listening" stops the recognizer (no lingering mic activity — verify via the stub's `stop()` call being invoked).
- Resize to mobile width and repeat the open/mic-button check inside `TopNav`'s `QuickCapturePanel` instance.

- [ ] **Step 5: Report results to the user**

Summarize: tests passing (counts), build clean, live verification outcomes (including any environment limitation on granting a real OS microphone permission prompt through automated browser tooling, if encountered), and hand off to `finishing-a-development-branch`.
