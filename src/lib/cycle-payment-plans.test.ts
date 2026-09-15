import { describe, expect, it, vi } from "vitest";
import { listCyclePaymentPlans, upsertCyclePaymentPlan } from "@/lib/cycle-payment-plans";

function makeFakePrisma() {
  return {
    budgetPeriod: { findFirst: vi.fn().mockResolvedValue({ id: "period-1" }) },
    loan: { findFirst: vi.fn().mockResolvedValue({ id: "loan-1" }) },
    creditCard: { findFirst: vi.fn().mockResolvedValue({ id: "card-1" }) },
    cyclePaymentPlan: {
      upsert: vi.fn().mockResolvedValue({ id: "plan-1", expectedAmount: 500_000 }),
      findMany: vi.fn().mockResolvedValue([]),
    },
  } as any;
}

describe("upsertCyclePaymentPlan", () => {
  it("creates one credit-card plan for a budget period", async () => {
    const prisma = makeFakePrisma();
    const result = await upsertCyclePaymentPlan(prisma, "user-1", {
      budgetPeriodId: "period-1",
      sourceType: "CREDIT_CARD",
      sourceId: "card-1",
      expectedAmount: 500_000,
      dueDate: new Date("2026-09-30"),
    });

    expect(result).toEqual({ ok: true, plan: { id: "plan-1", expectedAmount: 500_000 } });
    expect(prisma.cyclePaymentPlan.upsert).toHaveBeenCalledWith({
      where: {
        budgetPeriodId_sourceType_sourceId: {
          budgetPeriodId: "period-1",
          sourceType: "CREDIT_CARD",
          sourceId: "card-1",
        },
      },
      create: {
        userId: "user-1",
        budgetPeriodId: "period-1",
        sourceType: "CREDIT_CARD",
        sourceId: "card-1",
        expectedAmount: 500_000,
        dueDate: new Date("2026-09-30"),
      },
      update: { expectedAmount: 500_000, dueDate: new Date("2026-09-30") },
    });
  });

  it("rejects a plan whose source does not belong to the user", async () => {
    const prisma = makeFakePrisma();
    prisma.loan.findFirst.mockResolvedValue(null);

    await expect(
      upsertCyclePaymentPlan(prisma, "user-1", {
        budgetPeriodId: "period-1",
        sourceType: "LOAN",
        sourceId: "other-users-loan",
        expectedAmount: 1_000,
        dueDate: new Date("2026-09-15"),
      }),
    ).resolves.toEqual({ ok: false, error: "Loan not found" });
  });
});

describe("listCyclePaymentPlans", () => {
  it("scopes plans to the requested user and budget period", async () => {
    const prisma = makeFakePrisma();

    await listCyclePaymentPlans(prisma, "user-1", "period-1");

    expect(prisma.cyclePaymentPlan.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1", budgetPeriodId: "period-1" },
    });
  });
});
