"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAiEnabled } from "@/lib/ai/client";
import { askFinancialAssistant, type ChatMessage } from "@/lib/ai/financial-assistant";

export type AskAssistantResult = { ok: true; reply: string } | { ok: false; error: string };

const MAX_MESSAGE_LENGTH = 2000;
const MAX_HISTORY_MESSAGES = 20;

export async function askAssistantAction(message: string, history: ChatMessage[]): Promise<AskAssistantResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };
  if (!isAiEnabled()) return { ok: false, error: "The assistant isn't configured yet" };
  if (!message.trim()) return { ok: false, error: "Type a question first" };
  if (message.length > MAX_MESSAGE_LENGTH) return { ok: false, error: "That message is too long" };

  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.user.id } });
  const trimmedHistory = history.slice(-MAX_HISTORY_MESSAGES);

  try {
    const reply = await askFinancialAssistant(
      prisma,
      user.id,
      user.cycleStartDay,
      user.currency,
      trimmedHistory,
      message,
    );
    return { ok: true, reply };
  } catch {
    return { ok: false, error: "The assistant couldn't respond — try again" };
  }
}
