import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { planSeptemberImport } from "./september-import-core.mjs";
import { planSeptember18Import, projectSeptember18Import, summarizeSeptember18Import } from "./september-18-import-core.mjs";

neonConfig.webSocketConstructor = ws;
neonConfig.poolQueryViaFetch = true;
const emailIndex = process.argv.indexOf("--user-email");
const email = emailIndex >= 0 ? process.argv[emailIndex + 1] : undefined;
const apply = process.argv.includes("--apply");
const rollback = process.argv.includes("--rollback-check");
if (!email || (apply && rollback)) throw Error("Provide --user-email; choose read-only default, --rollback-check, or --apply.");
const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL }),
  transactionOptions: { maxWait: 10000, timeout: 60000 } });

async function read(db, userId) {
  const names = { account: "accounts", category: "categories", subcategory: "subcategories", loan: "loans",
    lending: "lendings", creditCard: "cards", transaction: "transactions", payable: "payables",
    auditLog: "auditLogs", budgetAllocation: "allocations", cyclePaymentPlan: "paymentPlans" };
  const state = { userId };
  await Promise.all(Object.entries(names).map(async ([model, plural]) => {
    state[plural] = await db[model].findMany({ where: { userId }, orderBy: { id: "asc" } });
  }));
  state.periods = await db.budgetPeriod.findMany({ where: { userId }, orderBy: { startDate: "asc" } });
  state.currentPeriod = state.periods.find((period) => period.startDate.toISOString().slice(0, 10) === "2026-09-11" && period.endDate.toISOString().slice(0, 10) === "2026-10-10");
  state.priorPeriod = state.periods.find((period) => period.startDate.toISOString().slice(0, 10) === "2026-08-11" && period.endDate.toISOString().slice(0, 10) === "2026-09-10");
  if (!state.currentPeriod || !state.priorPeriod) throw Error("Missing or ambiguous September cycle boundaries");
  state.period = state.currentPeriod;
  return state;
}

function ensurePriorImportComplete(state) {
  const prior = planSeptemberImport(state);
  const newCount = Object.values(prior.creates).flat().length;
  if (newCount || prior.loanUpdates.length || prior.unresolved.length) throw Error("September 11–16 import is no longer complete; stop before September 18");
  return prior;
}
function assertReconciled(summary) {
  const differences = summary.accounts.filter((row) => row.difference !== 0);
  if (differences.length) throw Error(`Account reconciliation mismatch: ${JSON.stringify(differences)}`);
  if (summary.totalMoney !== 15824095) throw Error(`Total money mismatch: ${summary.totalMoney}`);
  if (JSON.stringify(summary.eastWest) !== JSON.stringify({ available: 3603601, outstanding: 6296399, newCharges: 1744485 })) throw Error(`EastWest mismatch: ${JSON.stringify(summary.eastWest)}`);
  if (summary.newExpenses !== 1866385) throw Error(`September 18 expense mismatch: ${summary.newExpenses}`);
}
function print(plan, projected, previous) {
  console.log("September 11–16 checkpoint", JSON.stringify({ audited: previous.audit.length, creates: 0, unresolved: previous.unresolved }));
  console.log("September 18 source audit", JSON.stringify(plan.audit, null, 2));
  console.log("September 18 proposed transaction count", plan.creates.length);
  console.log("Unresolved", JSON.stringify(plan.unresolved));
  console.log("Projected reconciliation", JSON.stringify(projected, null, 2));
}

try {
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) throw Error("User not found");
  const before = await read(prisma, user.id);
  const previous = ensurePriorImportComplete(before);
  const plan = planSeptember18Import(before);
  const projected = summarizeSeptember18Import(projectSeptember18Import(before, plan));
  print(plan, projected, previous);
  if (plan.unresolved.length) throw Error("Ambiguous or probable duplicate matches: no records imported");
  assertReconciled(projected);

  if (apply || rollback) {
    const sentinel = "INTENTIONAL_SEPTEMBER_18_ROLLBACK";
    try {
      await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${user.id}))`;
        await tx.$queryRaw`SELECT id FROM "Account" WHERE "userId" = ${user.id} FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM "Transaction" WHERE "userId" = ${user.id} FOR UPDATE`;
        const locked = await read(tx, user.id);
        ensurePriorImportComplete(locked);
        const current = planSeptember18Import(locked);
        if (current.unresolved.length) throw Error("Records changed since dry run; import cancelled");
        assertReconciled(summarizeSeptember18Import(projectSeptember18Import(locked, current)));
        if (current.creates.length) await tx.transaction.createMany({ data: current.creates });
        if (current.creates.length) await tx.auditLog.createMany({ data: current.creates.map((row) => ({
          userId: user.id, entityType: "TRANSACTION", entityId: row.id, action: "IMPORT",
          source: "USER_AUTHORIZED_SEPTEMBER_18_IMPORT", relatedRecordIds: row.linkedTransactionId ? [row.linkedTransactionId] : [],
          newValuesJson: JSON.stringify(row),
        })) });
        const after = await read(tx, user.id);
        const repeated = planSeptember18Import(after);
        if (repeated.creates.length || repeated.unresolved.length || repeated.audit.some((row) => row.status === "missing")) throw Error("Second-run audit is not zero-new");
        assertReconciled(summarizeSeptember18Import(after));
        if (rollback) throw Error(sentinel);
      });
    } catch (error) {
      if (!rollback || error.message !== sentinel) throw error;
    }

    const after = await read(prisma, user.id);
    if (rollback) {
      const changed = ["accounts", "categories", "subcategories", "loans", "lendings", "cards", "transactions", "payables", "allocations", "paymentPlans", "auditLogs", "periods"]
        .filter((name) => JSON.stringify(before[name]) !== JSON.stringify(after[name]));
      if (changed.length) throw Error(`Rollback changed live models: ${changed.join(", ")}`);
      console.log("Rollback integration test passed: all live financial records and audit logs are unchanged.");
    } else {
      const second = planSeptember18Import(after);
      const summary = summarizeSeptember18Import(after);
      assertReconciled(summary);
      console.log("Committed transactions", JSON.stringify(plan.creates.map((row) => ({ id: row.id, date: row.date, type: row.type, amount: row.amount, description: row.description, accountId: row.accountId })), null, 2));
      console.log("Second-run audit", JSON.stringify({ creates: second.creates.length, unresolved: second.unresolved, missing: second.audit.filter((row) => row.status === "missing").length }));
      console.log("FINAL SEPTEMBER 18 SUMMARY", JSON.stringify({ importedEvents: plan.audit.filter((row) => row.status === "missing").length,
        newTransactions: plan.creates.length, skippedExisting: plan.audit.filter((row) => row.status !== "missing"), unresolved: [], reconciliation: summary }, null, 2));
    }
  }
} finally {
  await prisma.$disconnect();
}
