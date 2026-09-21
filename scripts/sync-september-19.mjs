import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { planSeptember19Sync, projectSeptember19Sync, summarizeSeptember19Sync } from "./september-19-sync-core.mjs";

neonConfig.webSocketConstructor = ws;
neonConfig.poolQueryViaFetch = true;
const emailIndex = process.argv.indexOf("--user-email");
const email = emailIndex >= 0 ? process.argv[emailIndex + 1] : undefined;
const apply = process.argv.includes("--apply");
const rollbackCheck = process.argv.includes("--rollback-check");
const summaryOnly = process.argv.includes("--summary");
if (!email || (apply && rollbackCheck)) throw Error("Provide --user-email. Choose read-only, --rollback-check, or --apply.");
const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL }),
  transactionOptions: { maxWait: 10000, timeout: 60000 } });

async function read(db, userId) {
  const models = { account: "accounts", category: "categories", subcategory: "subcategories", loan: "loans",
    creditCard: "cards", transaction: "transactions", budgetPeriod: "periods", cyclePaymentPlan: "paymentPlans",
    planPayment: "planPayments", auditLog: "auditLogs" };
  const state = { userId };
  await Promise.all(Object.entries(models).map(async ([model, key]) => {
    state[key] = await db[model].findMany({ where: { userId }, orderBy: { id: "asc" } });
  }));
  state.currentPeriod = state.periods.find((row) => row.startDate.toISOString().slice(0, 10) === "2026-09-11" && row.endDate.toISOString().slice(0, 10) === "2026-10-10");
  if (!state.currentPeriod) throw Error("Missing September 11–October 10 budget period");
  return state;
}
const money = (value) => Number((value / 100).toFixed(2));
const day = (value) => new Date(value).toISOString().slice(0, 10);
function accountName(state, id) { return state.accounts.find((row) => row.id === id)?.name ?? id; }
function diagnostics(state, plan) {
  const balances = state.accounts.filter((row) => !row.archivedAt).map((row) => ({ name: row.name,
    opening: money(row.openingBalance), balance: money(row.openingBalance + state.transactions.filter((tx) => tx.accountId === row.id).reduce((sum, tx) => sum + tx.amount, 0)),
    includeInLiquidFunds: row.includeInLiquidFunds, purpose: row.purpose }));
  const september19 = state.transactions.filter((row) => day(row.date) === "2026-09-19").map((row) => ({ id: row.id, date: day(row.date),
    type: row.type, amount: money(row.amount), source: accountName(state, row.accountId), destination: row.destinationAccountId ? accountName(state, row.destinationAccountId) : null,
    description: row.description, linkedTransactionId: row.linkedTransactionId, loanId: row.loanId, creditCardId: row.creditCardId }));
  const cardHistory = state.cards.map((card) => {
    const cardAccount = state.accounts.find((row) => row.id === card.accountId);
    return { name: cardAccount.name, creditLimit: money(card.creditLimit), openingAvailable: money(cardAccount.openingBalance),
      transactions: state.transactions.filter((row) => row.accountId === card.accountId).map((row) => ({ id: row.id, date: day(row.date), type: row.type, amount: money(row.amount), description: row.description })) };
  });
  return { balances, september19, cardHistory, plan };
}
function assertFinal(summary) {
  const differences = [...summary.accounts, ...summary.cards].filter((row) => row.difference !== 0);
  if (differences.length) throw Error(`Projected reconciliation mismatch: ${JSON.stringify(differences)}`);
  if (summary.usableFunds !== 2439530 || summary.chinaBank !== 3816068 || summary.totalIncludingChinaBank !== 6255598) throw Error(`Projected totals mismatch: ${JSON.stringify(summary)}`);
  if (summary.currentUnpaidPlans.length) throw Error(`Projected unpaid plans remain: ${JSON.stringify(summary.currentUnpaidPlans)}`);
}
function assertZero(plan) {
  if (plan.conflicts.length || plan.updates.length || (plan.deletes ?? []).length || plan.creates.transactions.length || plan.creates.planPayments.length) {
    throw Error(`Second-run audit is not zero-new: ${JSON.stringify(plan)}`);
  }
}
async function applyPlan(tx, state, plan) {
  const previous = new Map([
    ...state.accounts.map((row) => [`account:${row.id}`, row]),
    ...state.transactions.map((row) => [`transaction:${row.id}`, row]),
    ...state.paymentPlans.map((row) => [`cyclePaymentPlan:${row.id}`, row]),
    ...state.planPayments.map((row) => [`planPayment:${row.id}`, row]),
  ]);
  const audits = [];
  for (const deletion of plan.deletes.filter((row) => row.model === "planPayment")) {
    const before = previous.get(`planPayment:${deletion.id}`);
    const result = await tx.planPayment.deleteMany({ where: { id: deletion.id, userId: state.userId } });
    if (result.count !== 1) throw Error(`Delete failed for planPayment ${deletion.id}`);
    audits.push({ userId: state.userId, entityType: "PLAN_PAYMENT", entityId: deletion.id, action: "DELETE_DUPLICATE", source: "GOOGLE_SHEET_SEPTEMBER_19_SYNC", previousValuesJson: JSON.stringify(before), relatedRecordIds: [deletion.id] });
  }
  for (const update of plan.updates.filter((row) => row.model === "transaction")) {
    const result = await tx.transaction.updateMany({ where: { id: update.id, userId: state.userId }, data: update.data });
    if (result.count !== 1) throw Error(`Update failed for transaction ${update.id}`);
    audits.push({ userId: state.userId, entityType: "TRANSACTION", entityId: update.id, action: "SYNC_UPDATE", source: "GOOGLE_SHEET_SEPTEMBER_19_SYNC", previousValuesJson: JSON.stringify(previous.get(`transaction:${update.id}`)), newValuesJson: JSON.stringify(update.data), relatedRecordIds: [update.id] });
  }
  for (const deletion of plan.deletes.filter((row) => row.model === "transaction")) {
    const before = previous.get(`transaction:${deletion.id}`);
    const result = await tx.transaction.deleteMany({ where: { id: deletion.id, userId: state.userId } });
    if (result.count !== 1) throw Error(`Delete failed for transaction ${deletion.id}`);
    audits.push({ userId: state.userId, entityType: "TRANSACTION", entityId: deletion.id, action: "DELETE_DUPLICATE", source: "GOOGLE_SHEET_SEPTEMBER_19_SYNC", previousValuesJson: JSON.stringify(before), relatedRecordIds: [deletion.id] });
  }
  for (const update of plan.updates.filter((row) => row.model === "account")) {
    const result = await tx.account.updateMany({ where: { id: update.id, userId: state.userId }, data: update.data });
    if (result.count !== 1) throw Error(`Update failed for account ${update.id}`);
    audits.push({ userId: state.userId, entityType: "ACCOUNT", entityId: update.id, action: "SYNC_OPENING_SNAPSHOT", source: "GOOGLE_SHEET_SEPTEMBER_19_SYNC", previousValuesJson: JSON.stringify(previous.get(`account:${update.id}`)), newValuesJson: JSON.stringify(update.data), relatedRecordIds: [update.id] });
  }
  for (const update of plan.updates.filter((row) => row.model === "cyclePaymentPlan")) {
    const result = await tx.cyclePaymentPlan.updateMany({ where: { id: update.id, userId: state.userId }, data: update.data });
    if (result.count !== 1) throw Error(`Update failed for cyclePaymentPlan ${update.id}`);
    audits.push({ userId: state.userId, entityType: "CYCLE_PAYMENT_PLAN", entityId: update.id, action: "SYNC_UPDATE", source: "GOOGLE_SHEET_SEPTEMBER_19_SYNC", previousValuesJson: JSON.stringify(previous.get(`cyclePaymentPlan:${update.id}`)), newValuesJson: JSON.stringify(update.data), relatedRecordIds: [update.id] });
  }
  if (plan.creates.transactions.length) {
    await tx.transaction.createMany({ data: plan.creates.transactions });
    audits.push(...plan.creates.transactions.map((row) => ({ userId: state.userId, entityType: "TRANSACTION", entityId: row.id, action: "SYNC_CREATE", source: "GOOGLE_SHEET_SEPTEMBER_19_SYNC", newValuesJson: JSON.stringify(row), relatedRecordIds: row.linkedTransactionId ? [row.linkedTransactionId] : [] })));
  }
  if (plan.creates.planPayments.length) {
    await tx.planPayment.createMany({ data: plan.creates.planPayments });
    audits.push(...plan.creates.planPayments.map((row) => ({ userId: state.userId, entityType: "PLAN_PAYMENT", entityId: row.id, action: "SYNC_LINK", source: "GOOGLE_SHEET_SEPTEMBER_19_SYNC", newValuesJson: JSON.stringify(row), relatedRecordIds: [row.planId, row.transactionId] })));
  }
  if (audits.length) await tx.auditLog.createMany({ data: audits });
}

try {
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) throw Error("User not found");
  const before = await read(prisma, user.id);
  const plan = planSeptember19Sync(before);
  if (!summaryOnly) console.log("SEPTEMBER 19 LIVE AUDIT", JSON.stringify(diagnostics(before, plan), null, 2));
  if (plan.conflicts.length) throw Error(`Ambiguous matches; no write allowed: ${JSON.stringify(plan.conflicts)}`);
  const projected = summarizeSeptember19Sync(projectSeptember19Sync(before, plan));
  console.log("PROJECTED RECONCILIATION", JSON.stringify(projected, null, 2));
  assertFinal(projected);
  if (apply || rollbackCheck) {
    const sentinel = "INTENTIONAL_SEPTEMBER_19_ROLLBACK";
    try {
      await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${user.id}))`;
        await tx.$queryRaw`SELECT id FROM "Account" WHERE "userId" = ${user.id} FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM "Transaction" WHERE "userId" = ${user.id} FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM "CyclePaymentPlan" WHERE "userId" = ${user.id} FOR UPDATE`;
        const locked = await read(tx, user.id);
        const lockedPlan = planSeptember19Sync(locked);
        if (lockedPlan.conflicts.length) throw Error(`Records changed since dry run: ${JSON.stringify(lockedPlan.conflicts)}`);
        assertFinal(summarizeSeptember19Sync(projectSeptember19Sync(locked, lockedPlan)));
        await applyPlan(tx, locked, lockedPlan);
        const after = await read(tx, user.id);
        const repeated = planSeptember19Sync(after);
        assertZero(repeated);
        assertFinal(summarizeSeptember19Sync(after));
        if (rollbackCheck) throw Error(sentinel);
      });
    } catch (error) {
      if (!rollbackCheck || error.message !== sentinel) throw error;
    }
    if (rollbackCheck) {
      const afterRollback = await read(prisma, user.id);
      const changed = ["accounts", "categories", "subcategories", "loans", "cards", "transactions", "periods", "paymentPlans", "planPayments", "auditLogs"]
        .filter((key) => JSON.stringify(before[key]) !== JSON.stringify(afterRollback[key]));
      if (changed.length) throw Error(`Rollback check changed live models: ${changed.join(", ")}`);
      console.log("ROLLBACK CHECK PASSED: all live records are unchanged.");
    } else {
      const finalState = await read(prisma, user.id);
      const repeated = planSeptember19Sync(finalState);
      assertZero(repeated);
      const finalSummary = summarizeSeptember19Sync(finalState);
      assertFinal(finalSummary);
      console.log("FINAL SEPTEMBER 19 SYNC", JSON.stringify({ createdTransactions: plan.creates.transactions.length,
        repairedTransactions: plan.updates.filter((row) => row.model === "transaction").length,
        deletedDuplicates: plan.deletes.filter((row) => row.model === "transaction").length,
        linkedPlans: plan.creates.planPayments.length, secondRun: { creates: 0, updates: 0, deletes: 0, conflicts: 0 }, reconciliation: finalSummary }, null, 2));
    }
  }
} finally {
  await prisma.$disconnect();
}
