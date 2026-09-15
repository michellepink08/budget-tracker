import type { PrismaClient } from "@prisma/client";
import { createExpenseLikeTransaction } from "@/lib/transactions";

export type LoanInput = {
  name: string;
  principal: number; // minor units
  interestRate: number; // annual %, display-only
  monthlyPayment: number; // minor units
  openingBalance: number; // minor units — what was owed when this loan started being tracked here
  categoryId?: string | null;
  subcategoryId?: string | null;
  startDate: Date;
  endDate?: Date | null; // when set, the term (in months) is derived, not stored
  dueDay?: number | null; // day of month (1-31) — projects a monthly calendar entry when set
};

export type LoanMutationResult = { ok: true } | { ok: false; error: string };

export async function createLoan(
  prisma: Pick<PrismaClient, "loan">,
  userId: string,
  input: LoanInput,
) {
  return prisma.loan.create({ data: { userId, ...input } });
}

export async function updateLoan(
  prisma: Pick<PrismaClient, "loan">,
  userId: string,
  loanId: string,
  input: Partial<LoanInput>,
): Promise<LoanMutationResult> {
  const result = await prisma.loan.updateMany({
    where: { id: loanId, userId },
    data: input,
  });
  if (result.count === 0) {
    return { ok: false, error: "Loan not found" };
  }
  return { ok: true };
}

export async function archiveLoan(
  prisma: Pick<PrismaClient, "loan">,
  userId: string,
  loanId: string,
): Promise<LoanMutationResult> {
  const result = await prisma.loan.updateMany({
    where: { id: loanId, userId },
    data: { archivedAt: new Date() },
  });
  if (result.count === 0) {
    return { ok: false, error: "Loan not found" };
  }
  return { ok: true };
}

export async function listLoans(
  prisma: Pick<PrismaClient, "loan">,
  userId: string,
  options: { includeArchived?: boolean } = {},
) {
  return prisma.loan.findMany({
    where: {
      userId,
      ...(options.includeArchived ? {} : { archivedAt: null }),
    },
    include: { subcategory: true },
    orderBy: { createdAt: "asc" },
  });
}

export type LoanPaymentInput = { accountId: string; amount: number; date: Date };

// Never mutates any stored balance — see computeLoanRemainingBalance below.
// The payment transaction carries the loan's own categoryId/subcategoryId
// so it's counted the next time that balance is derived, and so it also
// shows up correctly categorized on the Budget/Ledger pages.
export async function makeLoanPayment(
  prisma: Pick<PrismaClient, "loan" | "transaction" | "budgetPeriod">,
  userId: string,
  cycleStartDay: number,
  loanId: string,
  input: LoanPaymentInput,
): Promise<LoanMutationResult> {
  const loan = await prisma.loan.findFirst({ where: { id: loanId, userId } });
  if (!loan) {
    return { ok: false, error: "Loan not found" };
  }

  await createExpenseLikeTransaction(prisma, userId, cycleStartDay, {
    type: "LOAN_PAYMENT",
    amount: input.amount,
    date: input.date,
    accountId: input.accountId,
    categoryId: loan.categoryId ?? undefined,
    subcategoryId: loan.subcategoryId ?? undefined,
    description: `Loan payment: ${loan.name}`,
  });

  return { ok: true };
}

// Derived, not stored — mirrors computeAccountBalance. A loan with no
// subcategory linked yet (only possible for loans created before this
// feature shipped) falls back to its opening balance as-is, since there's
// nothing to derive from.
export async function computeLoanRemainingBalance(
  prisma: Pick<PrismaClient, "transaction">,
  loan: { openingBalance: number; subcategoryId: string | null },
): Promise<number> {
  if (!loan.subcategoryId) return loan.openingBalance;

  const transactions = await prisma.transaction.findMany({ where: { subcategoryId: loan.subcategoryId } });
  const totalPaid = transactions.reduce((sum, txn) => sum + txn.amount, 0); // negative for outflow
  return Math.max(0, loan.openingBalance + totalPaid);
}

export type ResolveOrCreateLoanSubcategoryResult = { categoryId: string; subcategoryId: string };

// The building block for the "Borrowed" tab and the Loans page's own
// category field: types a loan's name (e.g. "Shopee Pay Later") and
// resolves it against a shared "Loan" category's existing subcategories
// (case-insensitive exact match), creating either the category or the
// subcategory (or both) the first time. No alias-learning — a loan is
// typed once, unlike Quick Capture's repeated free text.
export async function resolveOrCreateLoanSubcategory(
  prisma: Pick<PrismaClient, "category" | "subcategory">,
  userId: string,
  rawName: string,
): Promise<ResolveOrCreateLoanSubcategoryResult> {
  const trimmed = rawName.trim();

  let loanCategory = await prisma.category.findFirst({ where: { userId, name: "Loan" } });
  if (!loanCategory) {
    loanCategory = await prisma.category.create({
      data: { userId, name: "Loan", type: "DEBT_PAYMENT", color: "coral", icon: "tag" },
    });
  }

  const subcategories = await prisma.subcategory.findMany({ where: { userId, categoryId: loanCategory.id } });
  const match = subcategories.find(
    (s: { id: string; name: string }) => s.name.toLowerCase() === trimmed.toLowerCase(),
  );
  if (match) return { categoryId: loanCategory.id, subcategoryId: match.id };

  const created = await prisma.subcategory.create({
    data: { userId, categoryId: loanCategory.id, name: trimmed },
  });
  return { categoryId: loanCategory.id, subcategoryId: created.id };
}
