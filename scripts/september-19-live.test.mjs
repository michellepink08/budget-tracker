import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { computeAccountBalance } from "../src/lib/account-balance";
import { computeDisposableTotal } from "../src/lib/purpose-totals";
import { listCycleObligations } from "../src/lib/financial-obligation-view";
import { incomeVsExpenseByPeriod } from "../src/lib/reports";
import { computeLoanRemainingBalance } from "../src/lib/loans";

const live = process.env.RUN_SEPTEMBER_19_DB_TESTS === "1" ? describe : describe.skip;

live("September 19 live reconciliation", () => {
  let prisma, user, accounts, cards, loans, period;
  beforeAll(async () => {
    neonConfig.webSocketConstructor = ws;
    neonConfig.poolQueryViaFetch = true;
    prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL }) });
    user = await prisma.user.findUniqueOrThrow({ where: { email: "michellepgar@gmail.com" } });
    [accounts, cards, loans, period] = await Promise.all([
      prisma.account.findMany({ where: { userId: user.id, archivedAt: null } }),
      prisma.creditCard.findMany({ where: { userId: user.id } }),
      prisma.loan.findMany({ where: { userId: user.id, archivedAt: null } }),
      prisma.budgetPeriod.findFirstOrThrow({ where: { userId: user.id, startDate: new Date("2026-09-11"), endDate: new Date("2026-10-10") } }),
    ]);
  }, 60000);
  afterAll(async () => { if (prisma) await prisma.$disconnect(); });

  const owned = (name) => accounts.find((row) => row.name === name);
  it("matches every cash balance and excludes China Bank from usable funds", async () => {
    const expected = { Cash: 1025200, "BPI Savings": 599862, "GCash/CIMB": 569785, MariBank: 138062,
      "Maya Savings": 96447, GoTyme: 111, OwnBank: 6372, "UnionBank Savings": 3691, ChinaBank: 3816068 };
    for (const [name, amount] of Object.entries(expected)) expect(await computeAccountBalance(prisma, owned(name).id), name).toBe(amount);
    expect(await computeDisposableTotal(prisma, user.id)).toBe(2439530);
    expect(owned("ChinaBank")).toMatchObject({ purpose: "RESTRICTED", includeInLiquidFunds: false });
  }, 60000);

  it("matches both requested available-credit trackers", async () => {
    for (const [name, amount] of [["BPI Amore", 2775624], ["UnionBank Credit Card", 5406858]]) {
      const account = owned(name);
      expect(cards.find((row) => row.accountId === account.id)).toBeTruthy();
      expect(await computeAccountBalance(prisma, account.id), name).toBe(amount);
    }
  }, 60000);

  it("shows BPI, UnionBank, GLoan, and MariBank Loan paid with no unpaid planned obligation", async () => {
    const rows = await listCycleObligations(prisma, user.id, period.id, user.currency);
    expect(rows.find((row) => row.name === "BPI Amore")).toMatchObject({ expected: 2538983, actual: 2538983, remaining: 0, status: "PAID" });
    expect(rows.find((row) => row.name === "UnionBank Credit Card")).toMatchObject({ expected: 3902650, actual: 3902650, remaining: 0, status: "PAID" });
    expect(rows.find((row) => row.name === "GLoan")).toMatchObject({ expected: 769583, actual: 769583, remaining: 0, status: "PAID" });
    expect(rows.find((row) => row.name === "MariBank Loan")).toMatchObject({ expected: 677000, actual: 677000, remaining: 0, status: "PAID" });
    expect(rows.filter((row) => row.expected > 0 && row.remaining > 0)).toEqual([]);
  }, 60000);

  it("keeps transfers and debt payments out of spending while counting card purchases and cashback", async () => {
    const report = await incomeVsExpenseByPeriod(prisma, user.id);
    expect(report.find((row) => row.periodId === period.id)).toMatchObject({ expense: 4354167 });
    const rows = await prisma.transaction.findMany({ where: { userId: user.id, date: new Date("2026-09-19") } });
    expect(rows.filter((row) => row.type === "EXPENSE")).toHaveLength(4);
    expect(rows.filter((row) => row.type === "REFUND")).toHaveLength(2);
    expect(rows.filter((row) => row.type === "TRANSFER")).toHaveLength(6);
    expect(rows.filter((row) => row.type === "LOAN_PAYMENT")).toHaveLength(2);
    expect(rows.filter((row) => row.type === "CREDIT_CARD_PAYMENT")).toHaveLength(4);
    expect(rows.filter((row) => row.type === "INCOME")).toHaveLength(0);
  }, 60000);

  it("deducts each loan payment once from its named loan", async () => {
    expect(await computeLoanRemainingBalance(prisma, loans.find((row) => row.name === "GLoan"))).toBe(11543745);
    expect(await computeLoanRemainingBalance(prisma, loans.find((row) => row.name === "MariBank Loan"))).toBe(4062000);
  }, 60000);
});
