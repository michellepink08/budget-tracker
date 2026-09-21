import { describe, expect, it, vi } from "vitest";
import { createCycleIncomePlan, linkCycleIncomeActual, listCycleIncomePlans } from "@/lib/cycle-income-plans";

const input = { budgetPeriodId: "period-1", source: "Salary", expectedAmount: 5000000, expectedDate: new Date(2026, 8, 25), notes: null };

describe("cycle income plans", () => {
  it("groups categorized income even when receipt descriptions differ from the source label", async () => {
    const prisma: any = {
      cycleIncomePlan: { findMany: vi.fn().mockResolvedValue([{ id: "income-1", source: "Engage", categoryId: "income", subcategoryId: "engage", expectedAmount: 2200000, actualTransaction: null }]) },
      transaction: { findMany: vi.fn().mockResolvedValue([
        { id:"salary", type:"INCOME", categoryId:"income", subcategoryId:"engage", category:{type:"INCOME"}, date:new Date("2026-09-16"), description:"Engage salary", amount:2404668 },
        { id:"expense", type:"EXPENSE", categoryId:"income", subcategoryId:"engage", category:{type:"INCOME"}, date:new Date("2026-09-16"), description:"Engage", amount:-100 },
        { id:"wrong", type:"INCOME", categoryId:"food", subcategoryId:"engage", category:{type:"EXPENSE"}, date:new Date("2026-09-16"), description:"Engage", amount:200 },
      ]) },
    };
    expect((await listCycleIncomePlans(prisma, "user-1", "period-1"))[0]).toMatchObject({ actual: 2404668, difference: 204668, actualTransactionIds:["salary"], actualReceivedDate:new Date("2026-09-16") });
  });

  it("creates a plan in an owned period", async () => {
    const prisma: any = { budgetPeriod: { findFirst: vi.fn().mockResolvedValue({ id: "period-1" }) }, subcategory:{findMany:vi.fn().mockResolvedValue([{id:"salary",categoryId:"income",name:"Salary",category:{type:"INCOME"}}])}, cycleIncomePlan: { create: vi.fn().mockResolvedValue({ id: "income-1" }) } };
    expect(await createCycleIncomePlan(prisma, "user-1", input)).toEqual({ ok: true, id: "income-1" });
    expect(prisma.cycleIncomePlan.create.mock.calls[0][0].data).toMatchObject({categoryId:"income",subcategoryId:"salary"});
  });

  it("does not let a legacy link bypass category eligibility", async () => {
    const prisma: any = { cycleIncomePlan: { findMany: vi.fn().mockResolvedValue([{ id: "income-1", source: "Salary", expectedAmount: 5000000, expectedDate: input.expectedDate, notes: null, actualTransactionId: "txn-1", actualTransaction: { amount: 4850000 } }]) }, transaction: { findMany: vi.fn().mockResolvedValue([]) } };
    expect((await listCycleIncomePlans(prisma, "user-1", "period-1"))[0]).toMatchObject({ actual: 0, difference: -5000000 });
  });

  it("rejects linking an income transaction outside the plan's cycle", async () => {
    const prisma: any = {
      cycleIncomePlan: { findFirst: vi.fn().mockResolvedValue({ id: "income-1", budgetPeriod: { startDate: new Date(2026, 8, 11), endDate: new Date(2026, 9, 10) } }) },
      transaction: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    expect(await linkCycleIncomeActual(prisma, "user-1", "income-1", "txn-1")).toEqual({ ok: false, error: "Income transaction not found in this cycle" });
  });
});
