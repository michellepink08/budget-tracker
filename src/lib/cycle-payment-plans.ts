import type { PrismaClient } from "@prisma/client";

export type CyclePaymentPlanSourceType = "LOAN" | "CREDIT_CARD";

export type CyclePaymentPlanInput = {
  budgetPeriodId: string;
  sourceType: CyclePaymentPlanSourceType;
  sourceId: string;
  expectedAmount: number;
  dueDate: Date;
};

type CyclePaymentPlanPrisma = Pick<
  PrismaClient,
  "budgetPeriod" | "loan" | "creditCard" | "cyclePaymentPlan"
>;

export async function listCyclePaymentPlans(
  prisma: Pick<PrismaClient, "cyclePaymentPlan">,
  userId: string,
  budgetPeriodId: string,
) {
  return prisma.cyclePaymentPlan.findMany({ where: { userId, budgetPeriodId } });
}

export async function upsertCyclePaymentPlan(
  prisma: CyclePaymentPlanPrisma,
  userId: string,
  input: CyclePaymentPlanInput,
) {
  if (input.expectedAmount < 0) {
    return { ok: false as const, error: "Expected amount cannot be negative" };
  }

  const period = await prisma.budgetPeriod.findFirst({ where: { id: input.budgetPeriodId, userId } });
  if (!period) return { ok: false as const, error: "Budget period not found" };

  if (input.sourceType === "LOAN") {
    const loan = await prisma.loan.findFirst({
      where: { id: input.sourceId, userId, archivedAt: null },
    });
    if (!loan) return { ok: false as const, error: "Loan not found" };
  } else {
    const card = await prisma.creditCard.findFirst({ where: { id: input.sourceId, userId } });
    if (!card) return { ok: false as const, error: "Credit card not found" };
  }

  const plan = await prisma.cyclePaymentPlan.upsert({
    where: {
      budgetPeriodId_sourceType_sourceId: {
        budgetPeriodId: input.budgetPeriodId,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
      },
    },
    create: { userId, ...input },
    update: { expectedAmount: input.expectedAmount, dueDate: input.dueDate },
  });

  return { ok: true as const, plan };
}
