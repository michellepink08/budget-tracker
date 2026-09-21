import { describe, expect, it } from "vitest";
import { planSeptemberImport, summarizeSeptemberImport } from "./september-import-core.mjs";
import { planSloanSplit } from "./sloan-split-core.mjs";

export function fixture() {
  const accounts = [
    ["BPI Savings", 2591550], ["MariBank", 130656], ["Maya Savings", 83398],
    ["GCash/CIMB", 357715], ["Cash", 323000], ["ChinaBank", 1316068], ["Maya Credit Card", 2024241],
  ].map(([name, openingBalance], i) => ({ id: `a${i}`, userId: "u", name, openingBalance, archivedAt: null }));
  const categories = ["Income", "Utilities/Transpo/Subscription", "Home & Groceries", "Loan"].map((name, i) => ({ id: `c${i}`, userId: "u", name, archivedAt: null }));
  const subcategories = [
    ["Allotment", "c0"], ["Papa's Salary", "c0"], ["Engage", "c0"], ["PLDT", "c1"],
    ["Subscriptions", "c1"], ["Market / Grocery / Food", "c2"], ["Miscellaneous", "c2"],
    ["School Needs", "c2"], ["GGives", "c3"], ["Maya Loan", "c3"], ["SPaylater", "c3"], ["SLoan", "c3"],
  ].map(([name, categoryId], i) => ({ id: `s${i}`, userId: "u", name, categoryId, archivedAt: null }));
  const loans = [
    { id: "sp", name: "SPaylater", openingBalance: 7056914, subcategoryId: "s10" },
    { id: "sl", name: "SLoan", openingBalance: 9254909, subcategoryId: "s11", monthlyPayment: 1011244, endDate: new Date("2027-04-24"), dueDay: 24 },
    { id: "sl2", name: "SLoan 2", openingBalance: 1383383, subcategoryId: "generic", monthlyPayment: 153709, endDate: new Date("2027-05-14"), dueDay: 14 },
    { id: "gg", name: "GGives", openingBalance: 4340355, subcategoryId: "generic" },
    { id: "ml", name: "Maya Loan", openingBalance: 5225138, subcategoryId: "generic" },
    { id: "other", name: "GLoan", openingBalance: 12313328, subcategoryId: "generic" },
  ].map((l) => ({ ...l, userId: "u", categoryId: "c3", archivedAt: null }));
  const transactions = [
    { id: "cmu3ewz03000004kzqarwzjhx", date: "2026-09-11", type: "INCOME", amount: 4377574, accountId: "a0", description: "Income" },
    { id: "cmu3f0spa000004jnja9jnrij", date: "2026-09-11", type: "INCOME", amount: 9654103, accountId: "a0", description: "Income" },
    { id: "import_52fecd94f27d019d74e443aad0d8545eec598b3e", date: "2026-09-12", type: "LOAN_PAYMENT", amount: -2137360, accountId: "a1", description: "SPaylater payment", loanId: "sp", subcategoryId: "s10" },
    { id: "import_2693e42c6b7ef70ef6111806c71a39995db40117", date: "2026-09-12", type: "LOAN_PAYMENT", amount: -1164953, accountId: "a1", description: "SLoan payment", loanId: "sl", subcategoryId: "s11" },
  ].map((t) => ({ ...t, userId: "u", date: new Date(t.date), status: "CLEARED", budgetPeriodId: "p" }));
  return { userId: "u", accounts, categories, subcategories, loans, transactions, lendings: [],
    cards: [{ id: "card", userId: "u", accountId: "a6", creditLimit: 4500000 }],
    period: { id: "p", startDate: new Date("2026-09-11"), endDate: new Date("2026-10-10") } };
}

function projected(state, plan) {
  const after = structuredClone(state);
  for (const model of ["category", "subcategory", "lending", "transaction"]) {
    const plural = { category: "categories", subcategory: "subcategories", lending: "lendings", transaction: "transactions" }[model];
    after[plural].push(...plan.creates[model]);
  }
  for (const update of plan.loanUpdates) Object.assign(after.loans.find((l) => l.id === update.id), update.data);
  return after;
}

describe("remaining September import", () => {
  it("recognises the corrected two-loan split and cannot recreate the combined payment", () => {
    const s = fixture(), after = projected(s, planSeptemberImport(s));
    const split = planSloanSplit(after);
    for (const row of split.loanUpdates) Object.assign(after.loans.find((l) => l.id === row.id), row.data);
    Object.assign(after.transactions.find((t) => t.id === split.transactionUpdate.id), split.transactionUpdate.data);
    after.transactions.push(split.newTransaction);
    if (split.newSubcategory) after.subcategories.push(split.newSubcategory);
    const audited = planSeptemberImport(after);
    expect(audited.audit).toHaveLength(27);
    expect(audited.audit.find((a) => a.item === 6).recordIds).toHaveLength(2);
    expect(audited.unresolved).toEqual([]);
    expect(Object.values(audited.creates).flat()).toEqual([]);
    expect(audited.loanUpdates).toEqual([]);
  });
  it("audits all 27 sources and preserves the four existing entries", () => {
    const plan = planSeptemberImport(fixture());
    expect(plan.audit).toHaveLength(27);
    expect(plan.audit.filter((a) => a.status === "missing")).toHaveLength(23);
    expect(plan.audit.filter((a) => a.status === "preserved")).toHaveLength(4);
    expect(plan.unresolved).toEqual([]);
    expect(plan.creates.transaction).toHaveLength(31);
    expect(plan.loanUpdates.map((l) => l.id).sort()).toEqual(["gg", "ml"]);
  });
  it("a second execution creates zero records of every kind", () => {
    const state = fixture();
    const after = projected(state, planSeptemberImport(state));
    const second = planSeptemberImport(after);
    expect(Object.values(second.creates).flat()).toHaveLength(0);
    expect(second.loanUpdates).toEqual([]);
    expect(second.audit.filter((a) => a.status === "missing")).toEqual([]);
    expect(second.audit).toHaveLength(27);
    expect(second.audit.filter((a) => a.status === "alreadyRecorded")).toHaveLength(23);
  });
  it("reconciles six accounts without altering openings", () => {
    const state = fixture();
    const after = projected(state, planSeptemberImport(state));
    const summary = summarizeSeptemberImport(after);
    expect(summary.accounts.map((a) => a.calculated)).toEqual([11207895, 128943, 96447, 539368, 147100, 3816068]);
    expect(summary.accounts.map((a) => a.difference)).toEqual([0, 0, 0, 0, 0, 0]);
    expect(after.accounts).toEqual(state.accounts);
  });
  it("separates income, purchases, refunds, payments and transfers", () => {
    const state = fixture();
    const summary = summarizeSeptemberImport(projected(state, planSeptemberImport(state)));
    expect(summary.income).toBe(16436345);
    expect(summary.grossExpenses).toBe(698001);
    expect(summary.refunds).toBe(500);
    expect(summary.netExpenses).toBe(697501);
    expect(summary.transfers).toBe(8100000);
    expect(summary.loanPayments).toBe(4229217);
    expect(summary.cardPayments).toBe(749404);
    expect(summary.receivableRepayments).toBe(280000);
    expect(summary.cardPurchases).toBe(143211);
    expect(summary.cardOutstanding).toBe(1869566);
  });
  it("settles each Mama borrowing separately without August cash outflows", () => {
    const state = fixture();
    const after = projected(state, planSeptemberImport(state));
    expect(after.lendings).toHaveLength(4);
    expect(after.transactions.filter((t) => new Date(t.date) < new Date("2026-09-11"))).toEqual([]);
    const summary = summarizeSeptemberImport(after);
    expect(summary.receivables.map((l) => l.outstanding)).toEqual([0, 0, 0, 0]);
    expect(summary.receivableOutstanding).toBe(0);
    expect(after.transactions.filter((t) => t.type === "LENDING").map((t) => t.amount)).toEqual([-50000]);
  });
  it("links cashback and both legs of transfers and the card payment", () => {
    const plan = planSeptemberImport(fixture());
    const rows = plan.creates.transaction;
    const refund = rows.find((t) => t.type === "REFUND");
    expect(rows.find((t) => t.id === refund.linkedTransactionId)?.amount).toBe(-179900);
    for (const row of rows.filter((t) => ["TRANSFER", "CREDIT_CARD_PAYMENT"].includes(t.type))) {
      const other = rows.find((t) => t.id === row.linkedTransactionId);
      expect(other?.amount).toBe(-row.amount);
      expect(other?.linkedTransactionId).toBe(row.id);
    }
  });
  it("blocks probable duplicates including aliases and transfers already linked", () => {
    const state = fixture();
    state.transactions.push({ id: "manual", userId: "u", accountId: "a1", amount: -179900,
      date: new Date("2026-09-12"), type: "EXPENSE", description: "Internet" });
    const plan = planSeptemberImport(state);
    expect(plan.unresolved.find((a) => a.item === 8)?.recordIds).toEqual(["manual"]);
    expect(plan.creates.transaction.some((t) => t.amount === -179900)).toBe(false);
  });
  it("reports balance conflicts rather than overwriting them", () => {
    const state = fixture();
    state.accounts[0].openingBalance = 999;
    expect(planSeptemberImport(state).unresolved.some((a) => a.reason.includes("opening"))).toBe(true);
  });
  it("blocks a transfer represented only by an existing incoming leg", () => {
    const state = fixture();
    state.transactions.push({ id: "incoming", userId: "u", date: new Date("2026-09-12"),
      type: "TRANSFER", amount: 3500000, accountId: "a1", destinationAccountId: "a0", description: "Transfer" });
    expect(planSeptemberImport(state).unresolved.find((a) => a.item === 3)?.recordIds).toEqual(["incoming"]);
  });
  it("preserves manually recorded exact matches without requiring an import key", () => {
    const state = fixture();
    state.transactions.push({ id: "market", userId: "u", date: new Date("2026-09-13"),
      type: "EXPENSE", amount: -109900, accountId: "a4", description: "  MARKET purchases ",
      categoryId: "c2", subcategoryId: "s5", status: "CLEARED", budgetPeriodId: "p" });
    const plan = planSeptemberImport(state);
    expect(plan.audit.find((a) => a.item === 15)?.status).toBe("alreadyRecorded");
    expect(plan.creates.transaction.some((t) => t.amount === -109900)).toBe(false);
  });
  it("detects combined food orders instead of inserting both separate orders", () => {
    const state = fixture();
    state.transactions.push({ id: "combined", userId: "u", date: new Date("2026-09-14"),
      type: "EXPENSE", amount: -175000, accountId: "a3", description: "Food" });
    expect(planSeptemberImport(state).unresolved.filter((a) => [17, 18].includes(a.item))).toHaveLength(2);
  });
  it("blocks existing allocated receivable repayments even without import keys", () => {
    const state = fixture();
    const first = planSeptemberImport(state);
    const after = projected(state, first);
    after.transactions = after.transactions.filter((t) => t.type !== "RECEIVABLE_REPAYMENT");
    const allocation = first.creates.transaction.find((t) => t.type === "RECEIVABLE_REPAYMENT" && t.amount === 50000);
    after.transactions.push({ ...allocation, id: "manual-allocation" });
    expect(planSeptemberImport(after).unresolved.find((a) => a.item === 24)?.recordIds).toEqual(["manual-allocation"]);
  });
  it("blocks a stable key whose amount was edited", () => {
    const state = fixture();
    const after = projected(state, planSeptemberImport(state));
    after.transactions.find((t) => t.description === "Engage salary").amount = 1;
    expect(() => planSeptemberImport(after)).toThrow(/import key conflict/i);
  });
});
