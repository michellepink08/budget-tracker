import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { planSloanSplit, combinedPaymentId } from "./sloan-split-core.mjs";
import { planSeptemberImport, summarizeSeptemberImport } from "./september-import-core.mjs";

neonConfig.webSocketConstructor = ws;
neonConfig.poolQueryViaFetch = true;
const emailIndex = process.argv.indexOf("--user-email");
const email = emailIndex >= 0 ? process.argv[emailIndex + 1] : undefined;
const apply = process.argv.includes("--apply"), rollback = process.argv.includes("--rollback-check");
if (!email || (apply && rollback)) throw Error("Provide --user-email; default dry run, --rollback-check OR --apply");
const p = new PrismaClient({ adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL }), transactionOptions: { maxWait: 10000, timeout: 60000 } });
async function read(db, userId) {
  const state = { userId };
  await Promise.all(Object.entries({ account: "accounts", category: "categories", subcategory: "subcategories", loan: "loans", lending: "lendings", creditCard: "cards", transaction: "transactions", auditLog: "auditLogs" })
    .map(async ([model, name]) => { state[name] = await db[model].findMany({ where: { userId }, orderBy: { id: "asc" } }); }));
  state.period = await db.budgetPeriod.findUniqueOrThrow({ where: { userId_startDate: { userId, startDate: new Date("2026-09-11") } } });
  return state;
}
function verify(before, after) {
  const second = planSloanSplit(after);
  if (!second.alreadyCorrected || second.loanUpdates.length || second.newTransaction || second.transactionUpdate || second.newSubcategory) throw Error("Split is not idempotent");
  const full = planSeptemberImport(after);
  if (full.unresolved.length || full.loanUpdates.length || Object.values(full.creates).flat().length) throw Error("Full September audit is not zero-new");
  for (const t of before.transactions) if (t.id !== combinedPaymentId && JSON.stringify(after.transactions.find((r) => r.id === t.id)) !== JSON.stringify(t)) throw Error(`Unrelated transaction changed: ${t.id}`);
  if (JSON.stringify(before.accounts) !== JSON.stringify(after.accounts)) throw Error("Account openings changed");
  for (const l of before.loans) {
    const current = after.loans.find((r) => r.id === l.id);
    if (current.dueDay !== l.dueDay) throw Error("Regular due day changed");
    if (!/^SLoan(?: [12])?$/.test(l.name) && JSON.stringify(current) !== JSON.stringify(l)) throw Error(`Unrelated loan changed: ${l.name}`);
  }
  const beforeSummary = summarizeSeptemberImport(before), summary = summarizeSeptemberImport(after);
  for (const measure of ["income", "grossExpenses", "refunds", "netExpenses", "transfers", "loanPayments", "cardPayments", "receivableRepayments", "cardAvailable", "cardOutstanding", "receivableOutstanding"]) {
    if (beforeSummary[measure] !== summary[measure]) throw Error(`Accounting total changed: ${measure}`);
  }
  if (JSON.stringify(beforeSummary.accounts) !== JSON.stringify(summary.accounts) || summary.accounts.some((a) => a.difference)) throw Error("Account balance changed or did not reconcile");
  const remaining = ["SLoan 1", "SLoan 2"].map((name) => summary.loans.find((l) => l.name === name)?.remaining);
  if (remaining[0] !== 8089956 || remaining[1] !== 1383383 || remaining.reduce((sum, n) => sum + n, 0) !== 9473339) throw Error("Separate remaining balances did not reconcile");
  console.log("Verified split", JSON.stringify(second.summary));
  console.log("Full September audit", JSON.stringify({ sourceEntries: full.audit.length, missing: 0, newRecords: 0, unresolved: full.unresolved }));
  console.log("Account differences", JSON.stringify(summary.accounts.map((a) => ({ name: a.name, balance: a.calculated, difference: a.difference }))));
}
try {
  const user = await p.user.findUniqueOrThrow({ where: { email }, select: { id: true } });
  const before = await read(p, user.id), planned = planSloanSplit(before);
  console.log("Correction dry run", JSON.stringify(planned, null, 2));
  if (apply || rollback) {
    const sentinel = "INTENTIONAL_SLOAN_SPLIT_ROLLBACK";
    try {
      await p.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${user.id}))`;
        await tx.$queryRaw`SELECT id FROM "Loan" WHERE "userId" = ${user.id} FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM "Transaction" WHERE id = ${combinedPaymentId} AND "userId" = ${user.id} FOR UPDATE`;
        const locked = await read(tx, user.id), plan = planSloanSplit(locked);
        if (!plan.alreadyCorrected) {
          if (plan.newSubcategory) await tx.subcategory.create({ data: plan.newSubcategory });
          for (const row of plan.loanUpdates) {
            const result = await tx.loan.updateMany({ where: { id: row.id, userId: user.id, openingBalance: row.before.openingBalance, dueDay: row.before.dueDay }, data: row.data });
            if (result.count !== 1) throw Error("Loan changed since audit");
          }
          const original = plan.transactionUpdate;
          const result = await tx.transaction.updateMany({ where: { id: original.id, userId: user.id, amount: -1164953, loanId: original.before.loanId }, data: original.data });
          if (result.count !== 1) throw Error("Combined payment changed since audit");
          await tx.transaction.create({ data: plan.newTransaction });
          const rows = [...plan.loanUpdates.map((r) => ({ entityType: "LOAN", entityId: r.id, previousValuesJson: JSON.stringify(r.before), newValuesJson: JSON.stringify({ ...r.data, provenance: "Individual opening reconstructed from user-verified remaining plus that loan's own September 12 payment; replaces incorrect combined opening on a single loan." }) })),
            { entityType: "TRANSACTION", entityId: original.id, previousValuesJson: JSON.stringify(original.before), newValuesJson: JSON.stringify(original.data) },
            { entityType: "TRANSACTION", entityId: plan.newTransaction.id, newValuesJson: JSON.stringify(plan.newTransaction) }];
          await tx.auditLog.createMany({ data: rows.map((r) => ({ ...r, userId: user.id, action: "CORRECT_SLOAN_SPLIT", source: "USER_AUTHORIZED_SLOAN_SPLIT", relatedRecordIds: plan.paymentIds })) });
        }
        verify(locked, await read(tx, user.id));
        if (rollback) throw Error(sentinel);
      });
    } catch (error) { if (!rollback || error.message !== sentinel) throw error; }
    const after = await read(p, user.id);
    if (rollback) {
      const changed = Object.keys(before).filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]));
      if (changed.length) throw Error(`Rollback changed live data: ${changed}`);
      console.log("Rollback verified: all live records and audit logs unchanged.");
    } else {
      verify(before, after);
      console.log("Committed correction", JSON.stringify({ alreadyCorrected: planned.alreadyCorrected, payments: planSloanSplit(after).paymentIds,
        accountLedgerRowsBefore: before.transactions.length, accountLedgerRowsAfter: after.transactions.length }));
    }
  }
} finally { await p.$disconnect(); }
