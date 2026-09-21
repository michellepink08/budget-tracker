import { describe, expect, it } from "vitest";
import { combinedPaymentId, planSloanSplit } from "./sloan-split-core.mjs";
import { planSeptemberImport } from "./september-import-core.mjs";

function state() {
  return { userId: "u", period: { id: "p" },
    accounts: [{ id: "mari", userId: "u", name: "MariBank" }],
    loans: [
      { id: "l1", userId: "u", name: "SLoan", openingBalance: 9254909, monthlyPayment: 1011244,
        endDate: new Date("2027-04-24"), dueDay: 24, categoryId: "c", subcategoryId: "s1" },
      { id: "l2", userId: "u", name: "SLoan 2", openingBalance: 1383383, monthlyPayment: 153709,
        endDate: new Date("2027-05-14"), dueDay: 14, categoryId: "c", subcategoryId: "generic" },
      { id: "other", userId: "u", name: "GLoan", openingBalance: 12313328, subcategoryId: "generic" },
    ], subcategories: [{ id: "s1", userId: "u", categoryId: "c", name: "SLoan" }],
    transactions: [{ id: combinedPaymentId, userId: "u", accountId: "mari", type: "LOAN_PAYMENT", amount: -1164953,
      loanId: "l1", subcategoryId: "s1", categoryId: "c", date: new Date("2026-09-12"), budgetPeriodId: "p", status: "CLEARED", description: "SLoan payment", linkedTransactionId: null }],
  };
}
function project(s, plan) {
  const after = structuredClone(s);
  for (const update of plan.loanUpdates) Object.assign(after.loans.find((l) => l.id === update.id), update.data);
  if (plan.transactionUpdate) Object.assign(after.transactions.find((t) => t.id === plan.transactionUpdate.id), plan.transactionUpdate.data);
  if (plan.newTransaction) after.transactions.push(plan.newTransaction);
  if (plan.newSubcategory) after.subcategories.push(plan.newSubcategory);
  return after;
}
describe("separate SLoan correction", () => {
  it("reconstructs each opening and replaces the combined outflow without extra deduction", () => {
    const s = state(), plan = planSloanSplit(s), after = project(s, plan);
    expect(plan.loanUpdates.map((r) => r.data.openingBalance)).toEqual([9101200, 1537092]);
    expect(after.loans.slice(0, 2).reduce((sum, l) => sum + l.openingBalance, 0)).toBe(10638292);
    expect(after.transactions.map((t) => t.amount)).toEqual([-1011244, -153709]);
    expect(after.transactions.reduce((sum, t) => sum + t.amount, 0)).toBe(-1164953);
    const balances = after.loans.slice(0, 2).map((l) => l.openingBalance + after.transactions.filter((t) => t.subcategoryId === l.subcategoryId).reduce((sum, t) => sum + t.amount, 0));
    expect(balances).toEqual([8089956, 1383383]);
    expect(balances.reduce((sum, n) => sum + n, 0)).toBe(9473339);
    expect(after.transactions.every((t) => t.type === "LOAN_PAYMENT")).toBe(true);
    expect(after.loans[2]).toEqual(s.loans[2]);
  });
  it("preserves due days independently of corrected final payment dates", () => {
    const s = state(), after = project(s, planSloanSplit(s));
    expect(after.loans.slice(0, 2).map((l) => l.dueDay)).toEqual([24, 14]);
    expect(after.loans[1].endDate.toISOString().slice(0, 10)).toBe("2027-05-15");
  });
  it("a second correction makes no changes", () => {
    const s = state(), after = project(s, planSloanSplit(s));
    const second = planSloanSplit(after);
    expect(second.alreadyCorrected).toBe(true);
    expect(second.loanUpdates).toEqual([]);
    expect(second.newTransaction).toBeNull();
    expect(second.transactionUpdate).toBeNull();
    expect(second.newSubcategory).toBeNull();
  });
  it("blocks an extra manual payment instead of deducting it again", () => {
    const s = state();
    s.transactions.push({ ...s.transactions[0], id: "manual", amount: -153709, loanId: "l2" });
    expect(() => planSloanSplit(s)).toThrow(/payment history/i);
  });
  it("blocks a changed opening instead of silently overwriting it", () => {
    const s = state(); s.loans[1].openingBalance = 1;
    expect(() => planSloanSplit(s)).toThrow(/opening/i);
  });
});
