import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { planSeptemberImport, summarizeSeptemberImport } from "./september-import-core.mjs";

neonConfig.webSocketConstructor = ws;
neonConfig.poolQueryViaFetch = true;
const emailIndex = process.argv.indexOf("--user-email");
const email = emailIndex >= 0 ? process.argv[emailIndex + 1] : undefined;
const apply = process.argv.includes("--apply");
const rollback = process.argv.includes("--rollback-check");
if (!email || (apply && rollback)) throw Error("Provide --user-email; choose read-only default, --rollback-check, or --apply.");
const p = new PrismaClient({ adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL }),
  transactionOptions: { maxWait: 10000, timeout: 60000 } });

async function read(db, userId) {
  const names = { account: "accounts", category: "categories", subcategory: "subcategories", loan: "loans", lending: "lendings", creditCard: "cards",
    transaction: "transactions", payable: "payables", auditLog: "auditLogs", budgetAllocation: "allocations" };
  const state = { userId };
  await Promise.all(Object.entries(names).map(async ([model, plural]) => {
    state[plural] = await db[model].findMany({ where: { userId }, orderBy: { id: "asc" } });
  }));
  const periods = await db.budgetPeriod.findMany({ where: { userId, startDate: new Date("2026-09-11"), endDate: new Date("2026-10-10") } });
  if (periods.length !== 1) throw Error("Missing or ambiguous September cycle");
  state.period = periods[0];
  return state;
}

function project(state, plan) {
  const after = structuredClone(state);
  for (const [model, plural] of Object.entries({ category: "categories", subcategory: "subcategories", lending: "lendings", transaction: "transactions" })) after[plural].push(...plan.creates[model]);
  for (const update of plan.loanUpdates) Object.assign(after.loans.find((l) => l.id === update.id), update.data);
  return after;
}

function printPlan(plan) {
  console.log("Full source audit", JSON.stringify(plan.audit, null, 2));
  console.log("New record counts", JSON.stringify(Object.fromEntries(Object.entries(plan.creates).map(([model, rows]) => [model, rows.length]))));
  console.log("Unresolved", JSON.stringify(plan.unresolved));
}

function verify(before, after, plan) {
  // Every pre-existing transaction and account is preserved byte for byte.
  for (const name of ["transactions", "accounts", "lendings", "categories", "subcategories", "payables", "allocations"]) {
    for (const old of before[name]) {
      if (JSON.stringify(after[name].find((r) => r.id === old.id)) !== JSON.stringify(old)) throw Error(`Existing ${name} record changed: ${old.id}`);
    }
  }
  for (const old of before.loans) {
    const current = after.loans.find((l) => l.id === old.id);
    const update = plan.loanUpdates.find((l) => l.id === old.id);
    if (!update && JSON.stringify(old) !== JSON.stringify(current)) throw Error(`Protected/unrelated loan changed: ${old.name}`);
    if (update && (current.openingBalance !== old.openingBalance || current.subcategoryId !== update.data.subcategoryId)) throw Error("Unexpected loan update");
  }
  const second = planSeptemberImport(after);
  if (Object.values(second.creates).flat().length || second.loanUpdates.length || second.unresolved.length || second.audit.some((a) => a.status === "missing")) throw Error("Second audit is not zero-new");
  const summary = summarizeSeptemberImport(after);
  const wantedLoans = { SPaylater: 4919554, SLoan: 8089956, GGives: 4050998, "Maya Loan": 4587591 };
  if (summary.loans.some((l) => l.name === "SLoan 1")) {
    delete wantedLoans.SLoan;
    wantedLoans["SLoan 1"] = 8089956;
    wantedLoans["SLoan 2"] = 1383383;
  }
  for (const [name, amount] of Object.entries(wantedLoans)) if (summary.loans.find((l) => l.name === name)?.remaining !== amount) throw Error(`Loan did not reconcile: ${name}`);
  if (summary.receivableOutstanding !== 0 || summary.receivableRepayments !== 280000) throw Error("Mama repayments did not settle correctly");
  if (summary.income !== 16436345 || summary.grossExpenses !== 698001 || summary.refunds !== 500 || summary.transfers !== 8100000 ||
      summary.loanPayments !== 4229217 || summary.cardPayments !== 749404 || summary.cardPurchases !== 143211 || summary.cardOutstanding !== 1869566) throw Error("Accounting totals did not match approved source list");
  // Differences are reported, never corrected through synthetic adjustments.
  console.log("Account reconciliation and accounting verification", JSON.stringify(summary, null, 2));
  console.log("Second audit: zero additional records", JSON.stringify({ missing: 0, newRecords: 0, loanUpdates: 0, unresolved: second.unresolved }));
  return summary;
}

try {
  const user = await p.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) throw Error("User not found");
  const before = await read(p, user.id);
  const plan = planSeptemberImport(before);
  printPlan(plan);
  console.log("Projected reconciliation", JSON.stringify(summarizeSeptemberImport(project(before, plan)), null, 2));
  if (apply || rollback) {
    if (plan.unresolved.length) throw Error("Unresolved matches or balance conflicts: no records imported");
    const sentinel = "INTENTIONAL_IMPORT_ROLLBACK";
    try {
      await p.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${user.id}))`;
        await tx.$queryRaw`SELECT id FROM "Loan" WHERE "userId" = ${user.id} FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM "Account" WHERE "userId" = ${user.id} FOR UPDATE`;
        const locked = await read(tx, user.id);
        const current = planSeptemberImport(locked);
        if (current.unresolved.length) throw Error("Records changed since dry run; import cancelled");
        for (const model of ["category", "subcategory", "lending"]) {
          if (current.creates[model].length) await tx[model].createMany({ data: current.creates[model] });
        }
        for (const row of current.loanUpdates) {
          const updated = await tx.loan.updateMany({ where: { id: row.id, userId: user.id,
            openingBalance: row.before.openingBalance, subcategoryId: row.before.subcategoryId }, data: row.data });
          if (updated.count !== 1) throw Error("Loan history changed since authorization");
        }
        if (current.creates.transaction.length) await tx.transaction.createMany({ data: current.creates.transaction });
        const logs = [];
        for (const [model, rows] of Object.entries(current.creates)) for (const row of rows) logs.push({ userId: user.id,
          entityType: model === "transaction" ? "TRANSACTION" : model === "lending" ? "LENDING" : model.toUpperCase(), entityId: row.id,
          action: "IMPORT", source: "USER_AUTHORIZED_SEPTEMBER_IMPORT", relatedRecordIds: [],
          newValuesJson: JSON.stringify({ ...row, historicalReceivableOnly: model === "lending" && row.date.toISOString().slice(0, 10) !== "2026-09-15",
            explanation: model === "lending" && row.date.toISOString().slice(0, 10) !== "2026-09-15" ? "Historical/pre-existing receivable only; no account transaction or opening-balance change." : undefined }) });
        for (const row of current.loanUpdates) logs.push({ userId: user.id, entityType: "LOAN", entityId: row.id,
          action: "LINK_DEDICATED_PAYMENT_SUBCATEGORY", source: "USER_AUTHORIZED_SEPTEMBER_IMPORT", relatedRecordIds: [],
          previousValuesJson: JSON.stringify({ subcategoryId: row.before.subcategoryId }), newValuesJson: JSON.stringify(row.data) });
        if (logs.length) await tx.auditLog.createMany({ data: logs });
        verify(locked, await read(tx, user.id), current);
        if (rollback) throw Error(sentinel);
      });
    } catch (error) {
      if (!rollback || error.message !== sentinel) throw error;
    }
    const after = await read(p, user.id);
    if (rollback) {
      const changedModels = Object.keys(before).filter((name) => JSON.stringify(before[name]) !== JSON.stringify(after[name]));
      console.log("Rollback comparison by model", JSON.stringify({ changedModels, beforeCounts: Object.fromEntries(Object.entries(before).filter(([, value]) => Array.isArray(value)).map(([name, rows]) => [name, rows.length])),
        afterCounts: Object.fromEntries(Object.entries(after).filter(([, value]) => Array.isArray(value)).map(([name, rows]) => [name, rows.length])) }));
      if (changedModels.length) throw Error(`Rollback did not preserve live models: ${changedModels.join(", ")}`);
      console.log("Rollback integration test passed: all live records and audit logs unchanged.");
    } else {
      verify(before, after, plan);
      console.log("Committed new transactions", JSON.stringify(plan.creates.transaction.map((t) => ({ id: t.id, date: t.date, type: t.type, amount: t.amount, description: t.description })), null, 2));
      console.log("FINAL IMPORT SUMMARY", JSON.stringify({ importedSourceItems: plan.audit.filter((a) => a.status === "missing").length,
        newTransactions: plan.creates.transaction.length, newReceivables: plan.creates.lending.length,
        skippedSourceItems: plan.audit.filter((a) => a.status !== "missing"), unresolved: [] }));
    }
  }
} finally { await p.$disconnect(); }
