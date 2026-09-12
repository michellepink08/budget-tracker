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
  (globalThis as unknown as { SpeechRecognition: unknown }).SpeechRecognition = vi.fn(function (this: unknown) {
    const instance = new FakeRecognition();
    instances.push(instance);
    return instance;
  });
  return instances;
}

afterEach(() => {
  delete (globalThis as unknown as { SpeechRecognition?: unknown }).SpeechRecognition;
  delete (globalThis as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;
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
