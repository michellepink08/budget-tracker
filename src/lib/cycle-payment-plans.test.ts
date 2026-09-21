import { describe, expect, it, vi } from "vitest";
import { listCyclePaymentPlans, upsertCyclePaymentPlan } from "@/lib/cycle-payment-plans";

function makeFakePrisma() {
  return {
    budgetPeriod: { findFirst: vi.fn().mockResolvedValue({ id: "period-1" }) },
    loan: { findFirst: vi.fn().mockResolvedValue({ id: "loan-1" }) },
    creditCard: { findFirst: vi.fn().mockResolvedValue({ id: "card-1" }) },
    account: { findFirst: vi.fn().mockResolvedValue({ id: "cash-1" }) },
    cyclePaymentPlan: {
      upsert: vi.fn().mockResolvedValue({ id: "plan-1", expectedAmount: 500_000 }),
      findMany: vi.fn().mockResolvedValue([]),
    },
  } as any;
}

describe("upsertCyclePaymentPlan", () => {
  it("rejects a funding account owned by someone else", async () => {
    const prisma = makeFakePrisma();
    prisma.account.findFirst.mockResolvedValue(null);
    const result = await upsertCyclePaymentPlan(prisma, "user-1", {budgetPeriodId:"period-1",sourceType:"CREDIT_CARD",sourceId:"card-1",expectedAmount:100,dueDate:null,dueDateStatus:"UNSET",fundingAccountId:"other-cash"});
    expect(result).toEqual({ok:false,error:"Funding account not found"});
    expect(prisma.cyclePaymentPlan.upsert).not.toHaveBeenCalled();
  });
  it("rejects fractional centavos", async () => {
    const result = await upsertCyclePaymentPlan(makeFakePrisma(), "user-1", {budgetPeriodId:"period-1",sourceType:"CREDIT_CARD",sourceId:"card-1",expectedAmount:1.5,dueDate:null});
    expect(result.ok).toBe(false);
  });
  it("accepts an explicitly unset due date", async () => {
    const result = await upsertCyclePaymentPlan(makeFakePrisma(), "user-1", { budgetPeriodId:"period-1",sourceType:"CREDIT_CARD",sourceId:"card-1",expectedAmount:3571173,dueDate:null,dueDateStatus:"UNSET" });
    expect(result.ok).toBe(true);
  });
  it("rejects a confirmed date without a date value", async () => {
    const result = await upsertCyclePaymentPlan(makeFakePrisma(), "user-1", { budgetPeriodId:"period-1",sourceType:"CREDIT_CARD",sourceId:"card-1",expectedAmount:100,dueDate:null,dueDateStatus:"CONFIRMED" });
    expect(result).toEqual({ok:false,error:"Due date and confidence do not agree"});
  });
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
        dueDateStatus:"ESTIMATED",
      },
      update: { expectedAmount: 500_000, dueDate: new Date("2026-09-30"),dueDateStatus:"ESTIMATED" },
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
      include:{payments:{include:{transaction:true}},fundingAccount:true},
    });
  });
});
