import Anthropic from "@anthropic-ai/sdk";

// A single model constant so every AI feature (categorization, quick-capture
// fallback, receipt OCR, the assistant chat) moves together when it changes.
export const AI_MODEL = "claude-sonnet-5";

export function isAiEnabled(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

let cachedClient: Anthropic | null = null;

// Every AI feature calls this instead of constructing its own client, so
// there's one place that owns the "is a key configured" check. Callers are
// expected to guard with isAiEnabled() first where a graceful fallback
// exists (quick-capture, OCR); this throws for callers that have no
// fallback (the assistant chat, category suggestions).
export function getAnthropicClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set — AI features are disabled");
  }
  if (!cachedClient) {
    cachedClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return cachedClient;
}
