import type { PrismaClient } from "@prisma/client";
import { createExpenseLikeTransaction } from "@/lib/transactions";

export type LendingInput = {
  borrowerName: string;
  kind: "CASH" | "ITEM";
  amount?: number; // minor units — CASH only
  itemDescription?: string; // ITEM only
  itemValue?: number; // minor units — ITEM only
  accountId?: string; // CASH only
  categoryId?: string | null;
  subcategoryId?: string | null;
  date: Date;
};

export type LendingMutationResult = { ok: true } | { ok: false; error: string };

// Creating a CASH lend is itself a real event — money leaves an account
// right now — so this creates the linked outflow transaction in the same
// call, the same way `makeLoanPayment` bundles a transaction with a
// mutation. Unlike a Loan (which just records a pre-existing debt),
// there's no "just tell the app about it" case for cash.
export async function createLending(
  prisma: Pick<PrismaClient, "lending" | "transaction" | "budgetPeriod">,
  userId: string,
  cycleStartDay: number,
  input: LendingInput,
) {
  const lending = await prisma.lending.create({ data: { userId, ...input } });

  if (input.kind === "CASH" && input.accountId && input.amount) {
    await createExpenseLikeTransaction(prisma, userId, cycleStartDay, {
      type: "LENDING",
      amount: input.amount,
      date: input.date,
      accountId: input.accountId,
      categoryId: input.categoryId ?? undefined,
      subcategoryId: input.subcategoryId ?? undefined,
      description: `Lent to ${input.borrowerName}`,
    });
  }

  return lending;
}

export async function updateLending(
  prisma: Pick<PrismaClient, "lending">,
  userId: string,
  lendingId: string,
  input: Partial<LendingInput>,
): Promise<LendingMutationResult> {
  const result = await prisma.lending.updateMany({
    where: { id: lendingId, userId },
    data: input,
  });
  if (result.count === 0) {
    return { ok: false, error: "Lending not found" };
  }
  return { ok: true };
}

export async function archiveLending(
  prisma: Pick<PrismaClient, "lending">,
  userId: string,
  lendingId: string,
): Promise<LendingMutationResult> {
  const result = await prisma.lending.updateMany({
    where: { id: lendingId, userId },
    data: { archivedAt: new Date() },
  });
  if (result.count === 0) {
    return { ok: false, error: "Lending not found" };
  }
  return { ok: true };
}

export async function listLendings(
  prisma: Pick<PrismaClient, "lending">,
  userId: string,
  options: { includeArchived?: boolean } = {},
) {
  return prisma.lending.findMany({
    where: {
      userId,
      ...(options.includeArchived ? {} : { archivedAt: null }),
    },
    orderBy: { createdAt: "asc" },
  });
}

export async function markLendingReturned(
  prisma: Pick<PrismaClient, "lending">,
  userId: string,
  lendingId: string,
): Promise<LendingMutationResult> {
  const result = await prisma.lending.updateMany({
    where: { id: lendingId, userId },
    data: { returned: true },
  });
  if (result.count === 0) {
    return { ok: false, error: "Lending not found" };
  }
  return { ok: true };
}

export type LendingRepaymentInput = { accountId: string; amount: number; date: Date };

// However a repayment is entered — this dedicated helper, or a plain
// Income transaction categorized to the same subcategory by hand — it's
// tracked the same way: computeLendingOutstanding just sums whatever
// positive transactions exist for that subcategory. This function is a
// convenience, not the only path, mirroring makeLoanPayment.
export async function recordLendingRepayment(
  prisma: Pick<PrismaClient, "lending" | "transaction" | "budgetPeriod">,
  userId: string,
  cycleStartDay: number,
  lendingId: string,
  input: LendingRepaymentInput,
): Promise<LendingMutationResult> {
  const lending = await prisma.lending.findFirst({ where: { id: lendingId, userId } });
  if (!lending) {
    return { ok: false, error: "Lending not found" };
  }

  await createExpenseLikeTransaction(prisma, userId, cycleStartDay, {
    type: "INCOME",
    amount: input.amount,
    date: input.date,
    accountId: input.accountId,
    categoryId: lending.categoryId ?? undefined,
    subcategoryId: lending.subcategoryId ?? undefined,
    description: `Repayment from ${lending.borrowerName}`,
  });

  return { ok: true };
}

// Derived, not stored. Only CASH lends have anything to derive — ITEM
// lends use `returned` instead. The original outflow transaction (created
// by createLending) already IS `lending.amount`, so only the *positive*
// transactions against this subcategory (repayments) are summed here —
// including the outflow itself would double-count it against the amount
// it already represents.
export async function computeLendingOutstanding(
  prisma: Pick<PrismaClient, "transaction">,
  lending: { kind: string; amount: number | null; subcategoryId: string | null },
): Promise<number | null> {
  if (lending.kind !== "CASH" || lending.amount === null) return null;
  if (!lending.subcategoryId) return lending.amount;

  const transactions = await prisma.transaction.findMany({ where: { subcategoryId: lending.subcategoryId } });
  const totalRepaid = transactions
    .filter((txn: { amount: number }) => txn.amount > 0)
    .reduce((sum: number, txn: { amount: number }) => sum + txn.amount, 0);
  return Math.max(0, lending.amount - totalRepaid);
}

export type ResolveOrCreateLendingSubcategoryResult = { categoryId: string; subcategoryId: string };

// The building block for the "Loaned" tab and the Lending page's own
// form: types a borrower's name and resolves it against a shared
// "Lending" category's existing subcategories (case-insensitive exact
// match), creating either the category or the subcategory (or both) the
// first time. Mirrors resolveOrCreateLoanSubcategory exactly.
export async function resolveOrCreateLendingSubcategory(
  prisma: Pick<PrismaClient, "category" | "subcategory">,
  userId: string,
  borrowerName: string,
): Promise<ResolveOrCreateLendingSubcategoryResult> {
  const trimmed = borrowerName.trim();

  let lendingCategory = await prisma.category.findFirst({ where: { userId, name: "Lending" } });
  if (!lendingCategory) {
    lendingCategory = await prisma.category.create({
      data: { userId, name: "Lending", type: "INCOME", color: "coral", icon: "tag" },
    });
  }

  const subcategories = await prisma.subcategory.findMany({ where: { userId, categoryId: lendingCategory.id } });
  const match = subcategories.find(
    (s: { id: string; name: string }) => s.name.toLowerCase() === trimmed.toLowerCase(),
  );
  if (match) return { categoryId: lendingCategory.id, subcategoryId: match.id };

  const created = await prisma.subcategory.create({
    data: { userId, categoryId: lendingCategory.id, name: trimmed },
  });
  return { categoryId: lendingCategory.id, subcategoryId: created.id };
}
