"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAiEnabled } from "@/lib/ai/client";
import { suggestCategory } from "@/lib/ai/categorize-transaction";
import { listCategories } from "@/lib/categories";

export type SuggestCategoryResult = { ok: true; categoryName: string } | { ok: false; error: string };

// Categories are typed EXPENSE/INCOME (see prisma schema); a transaction's
// own type decides which side of the user's category list is a valid match
// — an income transaction should never come back categorized as "Groceries".
function categoryTypeFor(transactionType: string): string {
  return transactionType === "INCOME" ? "INCOME" : "EXPENSE";
}

export async function suggestCategoryForTransactionAction(
  description: string,
  amountMajorUnits: number,
  transactionType: string,
): Promise<SuggestCategoryResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };
  if (!isAiEnabled()) return { ok: false, error: "AI categorization is not configured" };
  if (!description.trim()) return { ok: false, error: "Enter a description first" };
  if (!Number.isFinite(amountMajorUnits) || amountMajorUnits <= 0) {
    return { ok: false, error: "Enter an amount first" };
  }

  const categories = await listCategories(prisma, session.user.id);
  const candidates: { id: string; name: string; type: string }[] = categories.filter(
    (c: { type: string }) => c.type === categoryTypeFor(transactionType),
  );

  try {
    const suggestion = await suggestCategory(
      description,
      Math.round(amountMajorUnits * 100),
      candidates.map((c) => ({ id: c.id, name: c.name })),
    );
    if (!suggestion.categoryId) return { ok: false, error: "No good match found" };

    const category = candidates.find((c) => c.id === suggestion.categoryId);
    if (!category) return { ok: false, error: "No good match found" };
    return { ok: true, categoryName: category.name };
  } catch {
    return { ok: false, error: "Category suggestion failed — try again" };
  }
}
