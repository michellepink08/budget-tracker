import { describe, expect, it } from "vitest";
import { planSeptemberLoanImport } from "../../scripts/september-loan-import-core.mjs";
import { incomeVsExpenseByPeriod } from "@/lib/reports";

function snapshot() {
  return {
    userId: "user",
    period: { id: "period", startDate: new Date("2026-09-11"), endDate: new Date("2026-10-10") },
    account: { id: "maribank", name: "MariBank" },
    loans: [
      { id: "sp", userId: "user", name: "SPaylater", openingBalance: 4919554, categoryId: "loan-cat", subcategoryId: "generic" },
      { id: "sl", userId: "user", name: "SLoan", openingBalance: 8089956, categoryId: "loan-cat", subcategoryId: "generic" },
      { id: "other", userId: "user", name: "GGives", openingBalance: 4340355, categoryId: "loan-cat", subcategoryId: "generic" },
    ],
    subcategories: [
      { id: "sp-sub", userId: "user", name: "SPaylater", categoryId: "loan-cat" },
      { id: "sl-sub", userId: "user", name: "SLoan", categoryId: "loan-cat" },
    ],
    transactions: [],
  };
}

describe("authorized September loan correction", () => {
  it("does not classify imported loan payments as income or expenses", async () => {
    const plan = planSeptemberLoanImport(snapshot());
    const totals = await incomeVsExpenseByPeriod({
      budgetPeriod: { findMany: async () => [{ id: "period", name: "September cycle" }] },
      transaction: { findMany: async () => plan.missing.map((p) => p.payment) },
    } as any, "user");
    expect(totals[0].income).toBe(0);
    expect(totals[0].expense).toBe(0);
  });
  it("uses corrected openings and deducts only each loan's own payment", () => {
    const state = snapshot();
    const plan = planSeptemberLoanImport(state);
    expect(plan.missing).toHaveLength(2);
    expect(plan.missing.map((p) => [p.loan.id, p.openingBalance, p.payment.amount, p.endingBalance])).toEqual([
      ["sp", 7056914, -2137360, 4919554],
      ["sl", 9254909, -1164953, 8089956],
    ]);
    expect(plan.missing.map((p) => p.payment.subcategoryId)).toEqual(["sp-sub", "sl-sub"]);
    expect(plan.missing.every((p) => p.payment.type === "LOAN_PAYMENT")).toBe(true);
    expect(plan.missing.find((p) => p.loan.id === "sl")?.provenance).toContain("derived");
    expect(plan.missing.some((p) => p.loan.id === "other")).toBe(false);
  });

  it("second execution creates zero payments and never resets corrected openings", () => {
    const state = snapshot();
    const first = planSeptemberLoanImport(state);
    for (const row of first.missing) {
      Object.assign(state.loans.find((l) => l.id === row.loan.id)!, {
        openingBalance: row.openingBalance, subcategoryId: row.payment.subcategoryId,
      });
      (state.transactions as any[]).push(row.payment);
    }
    const second = planSeptemberLoanImport(state);
    expect(second.missing).toEqual([]);
    expect(second.alreadyRecorded).toHaveLength(2);
    expect(second.probableDuplicates).toEqual([]);
  });

  it("blocks a probable duplicate rather than importing a second payment", () => {
    const state = snapshot();
    (state.transactions as any[]).push({ id: "manual", userId: "user", date: new Date("2026-09-12"),
      type: "LOAN_PAYMENT", amount: -2137360, accountId: "maribank", description: "Shopee Pay Later", loanId: null });
    const plan = planSeptemberLoanImport(state);
    expect(plan.missing.map((p) => p.loan.id)).toEqual(["sl"]);
    expect(plan.probableDuplicates[0].recordIds).toEqual(["manual"]);
  });

  it("blocks opening balances changed since authorization", () => {
    const state = snapshot();
    state.loans[1].openingBalance = 9473333;
    expect(() => planSeptemberLoanImport(state)).toThrow(/opening balance conflict/i);
  });

  it("rejects dedicated subcategories shared with another loan", () => {
    const state = snapshot();
    state.loans[2].subcategoryId = "sp-sub";
    expect(() => planSeptemberLoanImport(state)).toThrow(/shared/i);
  });

  it("checks one-day alias matches and same-day different type payments", () => {
    const state = snapshot();
    (state.transactions as any[]).push({ id: "short", userId: "user", date: new Date("2026-09-11"),
      type: "EXPENSE", amount: -2137360, accountId: "maribank", description: "SPayLater payment" });
    expect(planSeptemberLoanImport(state).probableDuplicates[0].recordIds).toEqual(["short"]);
  });
});
