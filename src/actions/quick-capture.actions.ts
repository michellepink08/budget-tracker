"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { listAccounts } from "@/lib/accounts";
import { listCategories } from "@/lib/categories";
import { listActiveCatalogItems } from "@/lib/shopping-catalog";
import { parseCommand } from "@/lib/quick-capture/deterministic-parser";
import { aiParseQuickCapture } from "@/lib/quick-capture/ai-parser";
import { executeDraft, undoExecution } from "@/lib/quick-capture/execute";
import { answerQuestion } from "@/lib/quick-capture/answer-question";
import { isAiEnabled } from "@/lib/ai/client";
import type { CommandDraft } from "@/lib/quick-capture/types";

async function currentUser() {
  const session = await auth();
  if (!session?.user) return null;
  return prisma.user.findUniqueOrThrow({ where: { id: session.user.id } });
}

export type ParseQuickCaptureResult = { ok: true; drafts: CommandDraft[] } | { ok: false; error: string };

export async function parseQuickCaptureAction(text: string): Promise<ParseQuickCaptureResult> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "You must be logged in" };
  if (!text.trim()) return { ok: false, error: "Type a command first" };

  const [accounts, categories, shoppingItems] = await Promise.all([
    listAccounts(prisma, user.id),
    listCategories(prisma, user.id),
    listActiveCatalogItems(prisma, user.id),
  ]);

  const drafts = await parseCommand(
    prisma,
    {
      userId: user.id,
      currency: user.currency,
      accounts: accounts.map((a) => ({ id: a.id, name: a.name })),
      categories: categories.map((c) => ({ id: c.id, name: c.name })),
      shoppingItems,
      now: new Date(),
    },
    text,
  );

  const withAnswers = await Promise.all(
    drafts.map(async (draft) =>
      draft.intent === "question"
        ? { ...draft, answer: await answerQuestion(prisma, user.id, user.cycleStartDay, draft) }
        : draft,
    ),
  );

  return { ok: true, drafts: withAnswers };
}

// A second-opinion parse using an LLM instead of the deterministic
// regex parser — offered in the UI as an explicit "Try with AI" fallback
// for text the deterministic parser visibly got wrong (it never fails
// outright; its catch-all clause just guesses badly on unusual phrasing).
export async function parseQuickCaptureWithAiAction(text: string): Promise<ParseQuickCaptureResult> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "You must be logged in" };
  if (!text.trim()) return { ok: false, error: "Type a command first" };
  if (!isAiEnabled()) return { ok: false, error: "AI parsing is not configured" };

  const [accounts, categories, shoppingItems] = await Promise.all([
    listAccounts(prisma, user.id),
    listCategories(prisma, user.id),
    listActiveCatalogItems(prisma, user.id),
  ]);

  try {
    const draft = await aiParseQuickCapture(
      prisma,
      {
        userId: user.id,
        currency: user.currency,
        accounts: accounts.map((a) => ({ id: a.id, name: a.name })),
        categories: categories.map((c) => ({ id: c.id, name: c.name })),
        shoppingItems,
        now: new Date(),
      },
      text,
    );

    if (!draft) return { ok: false, error: "Couldn't understand that as a transaction" };
    return { ok: true, drafts: [draft] };
  } catch {
    return { ok: false, error: "AI parsing failed — try again" };
  }
}

export type ConfirmQuickCaptureResult = { ok: true; logId: string } | { ok: false; error: string };

export async function confirmQuickCaptureDraftAction(
  draft: CommandDraft,
): Promise<ConfirmQuickCaptureResult> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "You must be logged in" };

  const result = await executeDraft(prisma, user.id, user.cycleStartDay, draft);
  if (!result.ok) return result;

  const log = await prisma.quickCaptureLog.create({
    data: {
      userId: user.id,
      rawInput: draft.clauseText,
      parsedDraftJson: JSON.stringify(draft),
      resultingIds: result.resultingIds,
      previousValuesJson: result.previousValues ? JSON.stringify(result.previousValues) : null,
    },
  });

  revalidatePath("/", "layout");
  return { ok: true, logId: log.id };
}

export type UndoQuickCaptureResult = { ok: true } | { ok: false; error: string };

export async function undoQuickCaptureAction(logId: string): Promise<UndoQuickCaptureResult> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "You must be logged in" };

  const log = await prisma.quickCaptureLog.findFirst({ where: { id: logId, userId: user.id } });
  if (!log) return { ok: false, error: "Nothing to undo" };

  const draft = JSON.parse(log.parsedDraftJson) as CommandDraft;
  const previousValues = log.previousValuesJson
    ? (JSON.parse(log.previousValuesJson) as Record<string, unknown>)
    : null;

  const result = await undoExecution(prisma, user.id, draft.intent, log.resultingIds, previousValues);
  if (!result.ok) return result;

  revalidatePath("/", "layout");
  return { ok: true };
}
