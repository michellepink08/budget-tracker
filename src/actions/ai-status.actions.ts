"use server";

import { isAiEnabled } from "@/lib/ai/client";

// Shared by every client component that conditionally shows an AI-powered
// affordance (category suggestions, quick-capture's "Try with AI", the
// assistant chat link) — one place that knows whether ANTHROPIC_API_KEY
// is configured, since env vars aren't readable from client components.
export async function isAiEnabledAction(): Promise<boolean> {
  return isAiEnabled();
}
