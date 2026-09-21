import { describe, expect, it } from "vitest";
import { planSeptember18Import, projectSeptember18Import, summarizeSeptember18Import } from "./september-18-import-core.mjs";

function fixture() {
  const accounts = [
    ["BPI Savings", 11207895, "SAVINGS"], ["Cash", 147100, "CASH"], ["GCash/CIMB", 539368, "EWALLET"],
    ["MariBank", 128943, "EWALLET"], ["Maya Savings", 96447, "SAVINGS"], ["GoTyme", 111, "EWALLET"],
    ["OwnBank", 6372, "EWALLET"], ["UnionBank Savings", 3691, "SAVINGS"], ["ChinaBank", 3816068, "CHECKING"],
    ["EastWest Credit Card", 9900000, "CREDIT_CARD"],
  ].map(([name, openingBalance, accountType], i) => ({ id: `a${i}`, userId: "u", name, openingBalance, accountType, archivedAt: null }));
  const categories = [
    ["Home & Groceries", "EXPENSE"], ["Utilities/Transpo/Subscription", "EXPENSE"],
    ["Savings", "SAVINGS"], ["Health", "EXPENSE"],
  ].map(([name, type], i) => ({ id: `c${i}`, userId: "u", name, type, archivedAt: null }));
  const subcategories = [
    ["Market / Grocery / Food", "c0"], ["Rice", "c0"], ["Kid's School Snacks", "c0"],
    ["Personal Care", "c0"], ["Miscellaneous", "c0"], ["Transportation", "c1"],
    ["Home Improvement", "c2"], ["Hospital", "c3"],
  ].map(([name, categoryId], i) => ({ id: `s${i}`, userId: "u", name, categoryId, archivedAt: null }));
  const periods = [
    { id: "prior", userId: "u", startDate: new Date("2026-08-11"), endDate: new Date("2026-09-10") },
    { id: "current", userId: "u", startDate: new Date("2026-09-11"), endDate: new Date("2026-10-10") },
  ];
  const transactions = [
    { id: "ew-1", userId: "u", date: new Date("2026-09-06"), type: "EXPENSE", amount: -3000000, accountId: "a9", categoryId: "c3", subcategoryId: "s7", budgetPeriodId: "prior", description: "Cyan hospital admission deposit", status: "CLEARED", creditCardId: "ew-card" },
    { id: "ew-2", userId: "u", date: new Date("2026-09-10"), type: "EXPENSE", amount: -1551914, accountId: "a9", categoryId: "c3", subcategoryId: "s7", budgetPeriodId: "prior", description: "Cyan hospital remaining balance", status: "CLEARED", creditCardId: "ew-card" },
  ];
  return { userId: "u", accounts, categories, subcategories, periods, transactions,
    cards: [{ id: "ew-card", userId: "u", accountId: "a9", creditLimit: 9900000 }], currentPeriod: periods[1], priorPeriod: periods[0] };
}

describe("September 18 import", () => {
  it("creates the nine missing events as thirteen correctly classified ledger rows", () => {
    const plan = planSeptember18Import(fixture());
    expect(plan.unresolved).toEqual([]);
    expect(plan.audit).toHaveLength(11);
    expect(plan.audit.filter((row) => row.status === "missing")).toHaveLength(9);
    expect(plan.audit.filter((row) => row.status === "preserved")).toHaveLength(2);
    expect(plan.creates).toHaveLength(13);
    expect(plan.creates.filter((row) => row.type === "EXPENSE")).toHaveLength(11);
  });

  it("stores the EastWest mixed purchase as four allocations in one shared import group", () => {
    const rows = planSeptember18Import(fixture()).creates.filter((row) => row.notes?.includes("sept18-eastwest-mixed-1604685"));
    expect(rows).toHaveLength(4);
    expect(rows.reduce((sum, row) => sum - row.amount, 0)).toBe(1604685);
    expect(rows.map((row) => row.subcategoryId)).toEqual(["s0", "s1", "s2", "s3"]);
    expect(rows.every((row) => row.accountId === "a9" && row.creditCardId === "ew-card" && row.type === "EXPENSE")).toBe(true);
    expect(planSeptember18Import(fixture()).creates.some((row) => row.amount === -1604685)).toBe(false);
  });

  it("creates a linked fee-free withdrawal and keeps card purchases off cash accounts", () => {
    const rows = planSeptember18Import(fixture()).creates;
    const withdrawal = rows.filter((row) => row.type === "TRANSFER");
    expect(withdrawal).toHaveLength(2);
    expect(withdrawal.map((row) => row.amount).sort((a, b) => a - b)).toEqual([-1000000, 1000000]);
    expect(withdrawal[0].linkedTransactionId).toBe(withdrawal[1].id);
    expect(withdrawal[1].linkedTransactionId).toBe(withdrawal[0].id);
    expect(rows.filter((row) => row.accountId === "a9").reduce((sum, row) => sum - row.amount, 0)).toBe(1744485);
  });

  it("reconciles all nine money accounts and the EastWest liability without adjustments", () => {
    const state = fixture();
    const after = projectSeptember18Import(state, planSeptember18Import(state));
    const summary = summarizeSeptember18Import(after);
    expect(summary.accounts.map((row) => row.difference)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(summary.totalMoney).toBe(15824095);
    expect(summary.eastWest).toEqual({ available: 3603601, outstanding: 6296399, newCharges: 1744485 });
    expect(summary.newExpenses).toBe(1866385);
  });

  it("is idempotent and creates zero records on a second run", () => {
    const state = fixture();
    const first = planSeptember18Import(state);
    const second = planSeptember18Import(projectSeptember18Import(state, first));
    expect(second.creates).toEqual([]);
    expect(second.unresolved).toEqual([]);
    expect(second.audit.filter((row) => row.status === "missing")).toEqual([]);
    expect(second.audit.filter((row) => row.status === "alreadyRecorded")).toHaveLength(9);
  });

  it("stops on a probable manual duplicate instead of inserting it", () => {
    const state = fixture();
    state.transactions.push({ id: "manual", userId: "u", date: new Date("2026-09-18"), type: "EXPENSE", amount: -139800,
      accountId: "a9", description: "Comforter from Gaisano", status: "CLEARED", budgetPeriodId: "current" });
    const plan = planSeptember18Import(state);
    expect(plan.unresolved.find((row) => row.item === "28-comforter")?.recordIds).toEqual(["manual"]);
    expect(plan.creates.some((row) => row.amount === -139800)).toBe(false);
  });

  it("adds either historical EastWest charge only when it is truly missing", () => {
    const state = fixture();
    state.transactions = state.transactions.filter((row) => row.id !== "ew-2");
    const plan = planSeptember18Import(state);
    const row = plan.creates.find((row) => row.amount === -1551914);
    expect(row).toMatchObject({ date: new Date("2026-09-10"), budgetPeriodId: "prior", accountId: "a9", creditCardId: "ew-card" });
  });
});
