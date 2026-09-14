import type { PrismaClient } from "@prisma/client";
import { createExpenseLikeTransaction } from "@/lib/transactions";

export type LoanInput = {
  name: string;
  principal: number; // minor units
  interestRate: number; // annual %, display-only
  monthlyPayment: number; // minor units
  remainingBalance: number; // minor units
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
    orderBy: { createdAt: "asc" },
  });
}

export type LoanPaymentInput = { accountId: string; amount: number; date: Date };

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
    description: `Loan payment: ${loan.name}`,
  });

  const remainingBalance = Math.max(0, loan.remainingBalance - input.amount);
  await prisma.loan.update({ where: { id: loanId }, data: { remainingBalance } });

  return { ok: true };
}
