import { describe, expect, it } from "vitest";
import {
  planSeptember19Sync,
  projectSeptember19Sync,
  summarizeSeptember19Sync,
} from "./september-19-sync-core.mjs";

const d = (value) => new Date(`${value}T00:00:00.000Z`);

function fixture() {
  const accounts = [
    ["cash", "Cash", 1025200, true],
    ["bpi", "BPI Savings", 10207895, true],
    ["gcash", "GCash/CIMB", 539368, true],
    ["mari", "MariBank", 128943, true],
    ["maya", "Maya Savings", 96447, true],
    ["gotyme", "GoTyme", 111, true],
    ["own", "OwnBank", 6372, true],
    ["ubs", "UnionBank Savings", 3691, true],
    ["china", "ChinaBank", 3816068, false],
    ["bpicard", "BPI Amore", 346641, false],
    ["ubcard", "UnionBank Credit Card", 1504208, false],
  ].map(([id, name, openingBalance, includeInLiquidFunds]) => ({
    id, userId: "u", name, openingBalance, includeInLiquidFunds,
    accountType: name.includes("Credit Card") || name === "BPI Amore" ? "CREDIT_CARD" : "BANK",
    purpose: name === "ChinaBank" ? "Tierra Alta" : "DISPOSABLE", archivedAt: null,
  }));
  const categories = [
    ["utilities", "Utilities/Transpo/Subscription", "EXPENSE"],
    ["loan", "Loan", "DEBT_PAYMENT"],
  ].map(([id, name, type]) => ({ id, userId: "u", name, type, archivedAt: null }));
  const subcategories = [
    ["subscriptions", "utilities", "Subscriptions"], ["rent", "utilities", "Rent"],
    ["mcwd", "utilities", "MCWD"], ["veco", "utilities", "VECO"],
    ["gloan-sub", "loan", "GLoan"], ["mari-loan-sub", "loan", "MariBank Loan"],
  ].map(([id, categoryId, name]) => ({ id, userId: "u", categoryId, name, archivedAt: null }));
  const loans = [
    { id: "gloan", userId: "u", name: "GLoan", categoryId: "loan", subcategoryId: "gloan-sub", openingBalance: 12313328, archivedAt: null },
    { id: "mari-loan", userId: "u", name: "MariBank Loan", categoryId: "loan", subcategoryId: "mari-loan-sub", openingBalance: 4739000, archivedAt: null },
  ];
  const cards = [
    { id: "bpi-card", userId: "u", accountId: "bpicard", creditLimit: 3500000 },
    { id: "ub-card", userId: "u", accountId: "ubcard", creditLimit: 6500000 },
  ];
  const periods = [{ id: "period", userId: "u", startDate: d("2026-09-11"), endDate: d("2026-10-10") }];
  const paymentPlans = [
    { id: "plan-gloan", userId: "u", budgetPeriodId: "period", sourceType: "LOAN", sourceId: "gloan", expectedAmount: 769583 },
    { id: "plan-mari", userId: "u", budgetPeriodId: "period", sourceType: "LOAN", sourceId: "mari-loan", expectedAmount: 677000 },
    { id: "plan-bpi", userId: "u", budgetPeriodId: "period", sourceType: "CREDIT_CARD", sourceId: "bpi-card", expectedAmount: 2538983 },
    { id: "plan-ub", userId: "u", budgetPeriodId: "period", sourceType: "CREDIT_CARD", sourceId: "ub-card", expectedAmount: 3571173 },
  ];
  return { userId: "u", accounts, categories, subcategories, loans, cards, periods,
    currentPeriod: periods[0], transactions: [], paymentPlans, planPayments: [], auditLogs: [] };
}

describe("September 19 synchronization", () => {
  it("creates the exact signed ledger without counting transfers or debt payments as expenses", () => {
    const state = fixture();
    const plan = planSeptember19Sync(state);
    expect(plan.conflicts).toEqual([]);
    expect(plan.creates.transactions).toHaveLength(18);
    expect(plan.creates.transactions.filter((row) => row.type === "TRANSFER")).toHaveLength(6);
    expect(plan.creates.transactions.filter((row) => row.type === "CREDIT_CARD_PAYMENT")).toHaveLength(4);
    expect(plan.creates.transactions.filter((row) => row.type === "LOAN_PAYMENT")).toHaveLength(2);
    expect(plan.creates.transactions.filter((row) => row.type === "REFUND")).toHaveLength(2);
    expect(plan.creates.transactions.filter((row) => row.type === "EXPENSE")).toHaveLength(4);
    expect(plan.creates.transactions.find((row) => row.description.includes("ChatGPT"))).toMatchObject({
      accountId: "bpicard", amount: -110000, type: "EXPENSE", creditCardId: "bpi-card",
    });
  });

  it("projects all source balances, card credit, plan links, and China Bank separation", () => {
    const state = fixture();
    const projected = projectSeptember19Sync(state, planSeptember19Sync(state));
    const summary = summarizeSeptember19Sync(projected);
    expect(summary.accounts).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "BPI Savings", calculated: 599862, difference: 0 }),
      expect.objectContaining({ name: "GCash/CIMB", calculated: 569785, difference: 0 }),
      expect.objectContaining({ name: "MariBank", calculated: 138062, difference: 0 }),
      expect.objectContaining({ name: "UnionBank Savings", calculated: 3691, difference: 0 }),
    ]));
    expect(summary.usableFunds).toBe(2439530);
    expect(summary.chinaBank).toBe(3816068);
    expect(summary.totalIncludingChinaBank).toBe(6255598);
    expect(summary.cards).toEqual([
      expect.objectContaining({ name: "BPI Amore", availableCredit: 2775624, difference: 0 }),
      expect.objectContaining({ name: "UnionBank Credit Card", availableCredit: 5406858, difference: 0 }),
    ]);
    expect(summary.currentUnpaidPlans).toEqual([]);
    expect(summary.currentExpenses).toBe(1790281);
  });

  it("matches on date, description, amount, source, and destination and is zero-new on repeat", () => {
    const state = fixture();
    const first = planSeptember19Sync(state);
    const after = projectSeptember19Sync(state, first);
    const second = planSeptember19Sync(after);
    expect(second.creates.transactions).toEqual([]);
    expect(second.creates.planPayments).toEqual([]);
    expect(second.updates).toEqual([]);
    expect(second.conflicts).toEqual([]);

    const transferIn = after.transactions.find((row) => row.description.includes("GCash") && row.amount > 0);
    transferIn.destinationAccountId = "mari";
    const conflict = planSeptember19Sync(after);
    expect(conflict.conflicts).toEqual(expect.arrayContaining([
      expect.objectContaining({ item: "transfer-bpi-gcash", reason: expect.stringContaining("partial") }),
    ]));
  });

  it("never treats cashback as regular income", () => {
    const state = fixture();
    const projected = projectSeptember19Sync(state, planSeptember19Sync(state));
    expect(projected.transactions.filter((row) => row.description.includes("cashback")))
      .toEqual([expect.objectContaining({ type: "REFUND", amount: 500 }), expect.objectContaining({ type: "REFUND", amount: 500 })]);
    expect(projected.transactions.filter((row) => row.type === "INCOME")).toEqual([]);
  });

  it("repairs the observed manual-entry defects without adding duplicate money movement", () => {
    const state = fixture();
    const desired = projectSeptember19Sync(state, planSeptember19Sync(state));
    const idMap = new Map(desired.transactions.map((row, index) => [row.id, `manual-${index}`]));
    desired.transactions = desired.transactions.map((row, index) => ({
      ...row, id: `manual-${index}`,
      linkedTransactionId: row.linkedTransactionId ? idMap.get(row.linkedTransactionId) : null,
      description: row.type === "TRANSFER" ? "Transfer" : row.description,
    }));
    const mariLoan = desired.transactions.find((row) => row.description.includes("MariBank Loan"));
    Object.assign(mariLoan, { type: "EXPENSE", loanId: null, description: "MariBank Loan" });
    const bpiOut = desired.transactions.find((row) => row.type === "CREDIT_CARD_PAYMENT" && row.accountId === "bpi");
    const bpiIn = desired.transactions.find((row) => row.type === "CREDIT_CARD_PAYMENT" && row.accountId === "bpicard");
    bpiOut.linkedTransactionId = null;
    const wrongCash = { ...bpiOut, id: "wrong-cash-payment", accountId: "cash", destinationAccountId: "bpicard",
      creditCardId: "bpi-card", linkedTransactionId: bpiIn.id, description: "Credit card payment" };
    bpiIn.linkedTransactionId = wrongCash.id;
    desired.transactions.push(wrongCash);
    const cashbackRows = desired.transactions.filter((row) => row.type === "REFUND");
    desired.transactions = desired.transactions.filter((row) => row.type !== "REFUND");
    desired.transactions.push({ ...cashbackRows[0], id: "combined-cashback", amount: 1000, description: "Refund" });
    const unionTransfer = desired.transactions.filter((row) => row.type === "TRANSFER" && ["bpi", "ubs"].includes(row.accountId) && ["bpi", "ubs"].includes(row.destinationAccountId));
    unionTransfer.forEach((row) => { row.amount = Math.sign(row.amount) * 4000000; });
    desired.accounts.find((row) => row.id === "bpicard").openingBalance = 247035;
    desired.accounts.find((row) => row.id === "ubcard").openingBalance = 588827;
    desired.paymentPlans.find((row) => row.id === "plan-ub").expectedAmount = 3571173;
    desired.planPayments = [];

    const repair = planSeptember19Sync(desired);
    expect(repair.conflicts).toEqual([]);
    expect(repair.deletes).toEqual([{ model: "transaction", id: "wrong-cash-payment" }]);
    expect(repair.creates.transactions).toHaveLength(1);
    expect(repair.creates.transactions[0]).toMatchObject({ type: "REFUND", amount: 500 });
    expect(repair.updates).toEqual(expect.arrayContaining([
      expect.objectContaining({ model: "account", id: "bpicard", data: expect.objectContaining({ openingBalance: 346641 }) }),
      expect.objectContaining({ model: "account", id: "ubcard", data: expect.objectContaining({ openingBalance: 1504208 }) }),
      expect.objectContaining({ model: "transaction", id: mariLoan.id, data: expect.objectContaining({ type: "LOAN_PAYMENT", loanId: "mari-loan" }) }),
      expect.objectContaining({ model: "cyclePaymentPlan", id: "plan-ub", data: expect.objectContaining({ expectedAmount: 3902650 }) }),
    ]));
    const final = summarizeSeptember19Sync(projectSeptember19Sync(desired, repair));
    expect(final.accounts.every((row) => row.difference === 0)).toBe(true);
    expect(final.cards.every((row) => row.difference === 0)).toBe(true);
    expect(final.currentUnpaidPlans).toEqual([]);
    expect(planSeptember19Sync(projectSeptember19Sync(desired, repair))).toMatchObject({
      creates: { transactions: [], planPayments: [] }, updates: [], deletes: [], conflicts: [],
    });
  });
});
