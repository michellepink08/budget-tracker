import { describe, expect, it, vi } from "vitest";
import { createCycleIncomePlan, linkCycleIncomeActual, listCycleIncomePlans } from "@/lib/cycle-income-plans";

const input = { budgetPeriodId: "period-1", source: "Salary", expectedAmount: 5000000, expectedDate: new Date(2026, 8, 25), notes: null };

describe("cycle income plans", () => {
  it("automatically totals same-name receipts regardless of capitalization or extra spaces", async () => {
    const prisma: any = {
      cycleIncomePlan: { findMany: vi.fn().mockResolvedValue([{ id: "income-1", source: "My Salary", expectedAmount: 5000000, actualTransaction: null }]) },
      transaction: { findMany: vi.fn().mockResolvedValue([{ description: "  MY   SALARY ", amount: 3000000 }, { description: "my salary", amount: 1800000 }, { description: "Other", amount: 900000 }]) },
    };
    expect((await listCycleIncomePlans(prisma, "user-1", "period-1"))[0]).toMatchObject({ actual: 4800000, difference: -200000 });
  });

  it("creates a plan in an owned period", async () => {
    const prisma: any = { budgetPeriod: { findFirst: vi.fn().mockResolvedValue({ id: "period-1" }) }, cycleIncomePlan: { create: vi.fn().mockResolvedValue({ id: "income-1" }) } };
    expect(await createCycleIncomePlan(prisma, "user-1", input)).toEqual({ ok: true, id: "income-1" });
  });

  it("returns actual and difference from the exact linked transaction", async () => {
    const prisma: any = { cycleIncomePlan: { findMany: vi.fn().mockResolvedValue([{ id: "income-1", source: "Salary", expectedAmount: 5000000, expectedDate: input.expectedDate, notes: null, actualTransactionId: "txn-1", actualTransaction: { amount: 4850000 } }]) }, transaction: { findMany: vi.fn().mockResolvedValue([]) } };
    expect((await listCycleIncomePlans(prisma, "user-1", "period-1"))[0]).toMatchObject({ actual: 4850000, difference: -150000 });
  });

  it("rejects linking an income transaction outside the plan's cycle", async () => {
    const prisma: any = {
      cycleIncomePlan: { findFirst: vi.fn().mockResolvedValue({ id: "income-1", budgetPeriod: { startDate: new Date(2026, 8, 11), endDate: new Date(2026, 9, 10) } }) },
      transaction: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    expect(await linkCycleIncomeActual(prisma, "user-1", "income-1", "txn-1")).toEqual({ ok: false, error: "Income transaction not found in this cycle" });
  });
});
