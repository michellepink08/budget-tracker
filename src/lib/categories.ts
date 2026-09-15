import type { PrismaClient } from "@prisma/client";
import { resolveAlias } from "@/lib/aliases";

export type CategoryInput = { name: string; type: string; color: string; icon: string };
export type SubcategoryInput = { name: string; categoryId: string };
export type CategoryMutationResult = { ok: true } | { ok: false; error: string };

export async function createCategory(
  prisma: Pick<PrismaClient, "category">,
  userId: string,
  input: CategoryInput,
) {
  return prisma.category.create({ data: { userId, ...input } });
}

export async function updateCategory(
  prisma: Pick<PrismaClient, "category">,
  userId: string,
  categoryId: string,
  input: Partial<CategoryInput>,
): Promise<CategoryMutationResult> {
  const result = await prisma.category.updateMany({
    where: { id: categoryId, userId },
    data: input,
  });
  if (result.count === 0) {
    return { ok: false, error: "Category not found" };
  }
  return { ok: true };
}

export async function archiveCategory(
  prisma: Pick<PrismaClient, "category">,
  userId: string,
  categoryId: string,
): Promise<CategoryMutationResult> {
  const result = await prisma.category.updateMany({
    where: { id: categoryId, userId },
    data: { archivedAt: new Date() },
  });
  if (result.count === 0) {
    return { ok: false, error: "Category not found" };
  }
  return { ok: true };
}

export async function listCategories(
  prisma: Pick<PrismaClient, "category">,
  userId: string,
  options: { includeArchived?: boolean } = {},
) {
  return prisma.category.findMany({
    where: {
      userId,
      ...(options.includeArchived ? {} : { archivedAt: null }),
    },
    include: { subcategories: { where: { archivedAt: null } } },
    orderBy: { sortOrder: "asc" },
  });
}

export type ResolveOrCreateCategoryResult = { ok: true; id: string } | { ok: false; error: string };

// A non-transfer transaction's own type is the only signal available for
// picking a sensible type for a brand-new category — REFUND and
// TRANSFER_FEE are still ordinary spending from a categorization
// standpoint, and the two debt-related types share Category's own
// DEBT_PAYMENT type rather than being lumped in with EXPENSE.
const CATEGORY_TYPE_FOR_TRANSACTION_TYPE: Record<string, string> = {
  EXPENSE: "EXPENSE",
  INCOME: "INCOME",
  REFUND: "EXPENSE",
  SAVINGS: "SAVINGS",
  LOAN_PAYMENT: "DEBT_PAYMENT",
  CREDIT_CARD_PAYMENT: "DEBT_PAYMENT",
  TRANSFER_FEE: "EXPENSE",
};

// The building block for "I don't want to set up categories ahead of
// time" — a raw word typed while adding a transaction resolves against
// the user's existing categories (by stored alias first, then by name,
// via the same resolveAlias already used by Quick Capture) or, if
// nothing matches, creates a brand-new category on the spot. Typing the
// same word again later always resolves to that same category, since it
// now matches by name.
export async function resolveOrCreateCategory(
  prisma: Pick<PrismaClient, "category" | "alias">,
  userId: string,
  rawName: string,
  transactionType: string,
): Promise<ResolveOrCreateCategoryResult> {
  const trimmed = rawName.trim();

  const existing = await prisma.category.findMany({ where: { userId } });
  const resolution = await resolveAlias(
    prisma,
    userId,
    "category",
    trimmed,
    (existing as { id: string; name: string }[]).map((c) => ({ id: c.id, name: c.name })),
  );
  if (resolution.status === "resolved") return { ok: true, id: resolution.id };
  if (resolution.status === "ambiguous") {
    return { ok: false, error: `"${trimmed}" matches more than one category — please be more specific` };
  }

  const categoryType = CATEGORY_TYPE_FOR_TRANSACTION_TYPE[transactionType] ?? "EXPENSE";
  const created = await prisma.category.create({
    data: { userId, name: trimmed, type: categoryType, color: "coral", icon: "tag" },
  });
  return { ok: true, id: created.id };
}

export async function assertOwnedCategory(
  prisma: Pick<PrismaClient, "category">,
  userId: string,
  categoryId: string,
): Promise<boolean> {
  const category = await prisma.category.findFirst({ where: { id: categoryId, userId } });
  return category !== null;
}

export async function assertOwnedSubcategory(
  prisma: Pick<PrismaClient, "subcategory">,
  userId: string,
  subcategoryId: string,
): Promise<boolean> {
  const subcategory = await prisma.subcategory.findFirst({ where: { id: subcategoryId, userId } });
  return subcategory !== null;
}

export type CreateSubcategoryResult = { ok: true; id: string } | { ok: false; error: string };

export async function createSubcategory(
  prisma: Pick<PrismaClient, "subcategory" | "category">,
  userId: string,
  input: SubcategoryInput,
): Promise<CreateSubcategoryResult> {
  const category = await prisma.category.findFirst({ where: { id: input.categoryId, userId } });
  if (!category) return { ok: false, error: "Category not found" };

  const subcategory = await prisma.subcategory.create({ data: { userId, ...input } });
  return { ok: true, id: subcategory.id };
}

export async function archiveSubcategory(
  prisma: Pick<PrismaClient, "subcategory">,
  userId: string,
  subcategoryId: string,
): Promise<CategoryMutationResult> {
  const result = await prisma.subcategory.updateMany({
    where: { id: subcategoryId, userId },
    data: { archivedAt: new Date() },
  });
  if (result.count === 0) {
    return { ok: false, error: "Subcategory not found" };
  }
  return { ok: true };
}
