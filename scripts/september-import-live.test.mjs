import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { computeAccountBalance } from "../src/lib/account-balance";
import { computeLoanRemainingBalance } from "../src/lib/loans";
import { computeLendingOutstanding } from "../src/lib/lending";
import { incomeVsExpenseByPeriod, spendingByCategory } from "../src/lib/reports";
import { computeDisposableTotal, computeSavingsTotal } from "../src/lib/purpose-totals";
import { listRestrictedFundGroups } from "../src/lib/restricted-funds";
import { listAllocationsWithActuals } from "../src/lib/budget-allocations";
import { planSeptemberImport } from "./september-import-core.mjs";

// Opt-in, read-only checks against the actual app helpers and live database.
const live = process.env.RUN_SEPTEMBER_DB_TESTS === "1" ? describe : describe.skip;
live("September import: live app accounting", () => {
  let p, user, state;
  beforeAll(async () => {
    neonConfig.webSocketConstructor = ws;
    neonConfig.poolQueryViaFetch = true;
    p = new PrismaClient({ adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL }) });
    user = await p.user.findUniqueOrThrow({ where: { email: "michellepgar@gmail.com" } });
    const period = await p.budgetPeriod.findUniqueOrThrow({ where: { userId_startDate: { userId: user.id, startDate: new Date("2026-09-11") } } });
    state = { userId: user.id, period };
    await Promise.all(Object.entries({ account: "accounts", category: "categories", subcategory: "subcategories", loan: "loans", lending: "lendings", creditCard: "cards", transaction: "transactions" })
      .map(async ([model, plural]) => { state[plural] = await p[model].findMany({ where: { userId: user.id } }); }));
  }, 60000);
  afterAll(async () => { if (p) await p.$disconnect(); });

  it("actual account balance helper reconciles all six accounts", async () => {
    const expected = { "BPI Savings": 10207895, MariBank: 128943, "Maya Savings": 96447,
      "GCash/CIMB": 539368, Cash: 1025200, ChinaBank: 3816068 };
    await Promise.all(Object.entries(expected).map(async ([name, value]) => {
      const a = state.accounts.find((a) => a.name === name);
      expect(await computeAccountBalance(p, a.id), name).toBe(value);
    }));
  }, 60000);

  it("actual loan helper isolates all named and untouched loans", async () => {
    const expected = { SPaylater: 4919554, "SLoan 1": 8089956, GGives: 4050998, "Maya Loan": 4587591,
      "SLoan 2": 1383383, GLoan: 12313328, "MariBank Loan": 4739000 };
    await Promise.all(Object.entries(expected).map(async ([name, value]) => {
      expect(await computeLoanRemainingBalance(p, state.loans.find((l) => l.name === name)), name).toBe(value);
    }));
  }, 60000);

  it("actual receivable helper settles all four Mama records", async () => {
    const mama = state.lendings.filter((l) => l.borrowerName === "Mama");
    expect(mama).toHaveLength(4);
    const outstanding = await Promise.all(mama.map((l) => computeLendingOutstanding(p, l)));
    expect(outstanding).toEqual([0, 0, 0, 0]);
    const repayments = state.transactions.filter((t) => t.type === "RECEIVABLE_REPAYMENT");
    expect(repayments).toHaveLength(4);
    expect(repayments.reduce((sum, t) => sum + t.amount, 0)).toBe(280000);
    expect(state.transactions.filter((t) => t.type === "INCOME")).toHaveLength(3);
  }, 60000);

  it("exactly two SLoans have one September 12 payment each and separately reconstructed openings", () => {
    const loans = state.loans.filter((l) => /^SLoan(?: [12])?$/.test(l.name) && !l.archivedAt).sort((a, b) => a.name.localeCompare(b.name));
    expect(loans).toHaveLength(2);
    expect(loans.map((l) => l.openingBalance)).toEqual([9101200, 1537092]);
    expect(loans.reduce((sum, l) => sum + l.openingBalance, 0)).toBe(10638292);
    expect(loans.map((l) => l.dueDay)).toEqual([24, 14]);
    expect(loans.map((l) => l.endDate.toISOString().slice(0, 10))).toEqual(["2027-04-24", "2027-05-15"]);
    const payments = state.transactions.filter((t) => loans.some((l) => l.id === t.loanId) && t.date.toISOString().slice(0, 10) === "2026-09-12");
    expect(payments).toHaveLength(2);
    expect(loans.map((l) => payments.filter((t) => t.loanId === l.id).length)).toEqual([1, 1]);
    expect(payments.reduce((sum, t) => sum + t.amount, 0)).toBe(-1164953);
    expect(payments.every((t) => t.type === "LOAN_PAYMENT")).toBe(true);
  });

  it("actual reports exclude payments and net the PLDT refund correctly", async () => {
    const totals = await incomeVsExpenseByPeriod(p, user.id);
    const cycle = totals.find((t) => t.periodId === state.period.id);
    expect(cycle.income).toBe(16436345);
    expect(cycle.expense).toBe(2563886);
    const spending = await spendingByCategory(p, user.id, state.period.id);
    expect(spending.reduce((sum, row) => sum + row.amount, 0)).toBe(2424086);
    const comforter = state.transactions.find((t) => t.amount === -139800 && t.date.toISOString().slice(0, 10) === "2026-09-18");
    expect(comforter?.amount).toBe(-139800);
    expect(state.subcategories.find((s) => s.id === comforter?.subcategoryId)?.name).toBe("Home Improvement");
    const refund = state.transactions.find((t) => t.type === "REFUND" && t.description === "PLDT cashback");
    expect(refund.amount).toBe(500);
    expect(state.transactions.find((t) => t.id === refund.linkedTransactionId)?.amount).toBe(-179900);
  }, 60000);

  it("actual Maya card balance reflects both purchases and the payment", async () => {
    const a = state.accounts.find((a) => a.name === "Maya Credit Card");
    const available = await computeAccountBalance(p, a.id);
    expect(available).toBe(2630434);
    expect(state.cards.find((c) => c.accountId === a.id).creditLimit - available).toBe(1869566);
  }, 60000);

  it("dashboard helper totals agree with account ledger balances", async () => {
    const balances = new Map(await Promise.all(state.accounts.map(async (a) => [a.id, await computeAccountBalance(p, a.id)])));
    const disposable = state.accounts.filter((a) => !a.archivedAt && a.purpose === "DISPOSABLE").reduce((sum, a) => sum + balances.get(a.id), 0);
    const savings = state.accounts.filter((a) => !a.archivedAt && a.purpose === "SAVINGS").reduce((sum, a) => sum + balances.get(a.id), 0);
    expect(await computeDisposableTotal(p, user.id)).toBe(disposable);
    expect(await computeSavingsTotal(p, user.id)).toBe(savings);
    expect((await listRestrictedFundGroups(p, user.id)).find((a) => a.accountName === "ChinaBank").balance).toBe(3816068);
    const allocations = await listAllocationsWithActuals(p, user.id, state.period.id);
    for (const allocation of allocations) {
      const relevant = state.transactions.filter((t) => t.budgetPeriodId === state.period.id &&
        (allocation.subcategoryId ? t.subcategoryId === allocation.subcategoryId : t.categoryId === allocation.categoryId));
      const actual = -relevant.reduce((sum, t) => sum + t.amount, 0);
      expect(allocation.actual).toBe(actual === 0 ? 0 : actual);
      expect(allocation.remaining).toBe(allocation.effectivePlanned - allocation.actual);
    }
    console.log("Verified live dashboard totals (centavos)", JSON.stringify({ disposable, savings,
      restricted: 3816068, budgetPlanned: allocations.reduce((sum, a) => sum + a.effectivePlanned, 0),
      budgetActual: allocations.reduce((sum, a) => sum + a.actual, 0) }));
  }, 60000);

  it("full post-import audit has zero new or unresolved records", () => {
    const plan = planSeptemberImport(state);
    expect(plan.audit).toHaveLength(27);
    expect(plan.unresolved).toEqual([]);
    expect(plan.loanUpdates).toEqual([]);
    expect(Object.values(plan.creates).flat()).toEqual([]);
  });
});
