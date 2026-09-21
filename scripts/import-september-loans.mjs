import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { planSeptemberLoanImport } from "./september-loan-import-core.mjs";

neonConfig.webSocketConstructor = ws;
neonConfig.poolQueryViaFetch = true;
const emailIndex = process.argv.indexOf("--user-email");
const email = emailIndex >= 0 ? process.argv[emailIndex + 1] : undefined;
if (!email) throw Error("Provide --user-email. Default is a read-only dry run; --rollback-check tests rollback; --apply imports.");
const apply = process.argv.includes("--apply");
const rollbackCheck = process.argv.includes("--rollback-check");
if (apply && rollbackCheck) throw Error("Choose apply OR rollback check");
const p = new PrismaClient({ adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL }),
  transactionOptions: { maxWait: 10000, timeout: 60000 } });

async function snapshot(db, userId) {
  const [accounts, periods, loans, subcategories, transactions] = await Promise.all([
    db.account.findMany({ where: { userId, name: "MariBank", archivedAt: null } }),
    db.budgetPeriod.findMany({ where: { userId, startDate: new Date("2026-09-11"), endDate: new Date("2026-10-10") } }),
    db.loan.findMany({ where: { userId }, orderBy: { id: "asc" } }),
    db.subcategory.findMany({ where: { userId, archivedAt: null } }),
    db.transaction.findMany({ where: { userId }, orderBy: { id: "asc" } }),
  ]);
  if (accounts.length !== 1 || periods.length !== 1) throw Error("Ambiguous account or cycle");
  return { userId, account: accounts[0], period: periods[0], loans, subcategories, transactions };
}

const balance = (state, loan) => Math.max(0, loan.openingBalance + state.transactions
  .filter((t) => t.subcategoryId === loan.subcategoryId && loan.subcategoryId != null)
  .reduce((sum, t) => sum + t.amount, 0));
const fingerprint = (state) => JSON.stringify({ loans: state.loans, transactions: state.transactions });

try {
  const user = await p.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) throw Error("User not found");
  const before = await snapshot(p, user.id);
  console.log("Dry-run audit", JSON.stringify(planSeptemberLoanImport(before), null, 2));
  if (apply || rollbackCheck) {
    const rollbackSentinel = "ROLLBACK_VERIFICATION_SUCCESS";
    try {
      await p.$transaction(async (tx) => {
        // Same user's importer runs cannot race. Loan locks also protect the
        // authorized openings against concurrent editing in the app.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${user.id}))`;
        await tx.$queryRaw`SELECT id FROM "Loan" WHERE "userId" = ${user.id} FOR UPDATE`;
        const locked = await snapshot(tx, user.id);
        const plan = planSeptemberLoanImport(locked);
        if (plan.probableDuplicates.length) throw Error("Probable duplicates require review; entire import cancelled");
        for (const row of plan.missing) {
          const changed = await tx.loan.updateMany({ where: { id: row.loan.id, userId: user.id,
            openingBalance: row.loan.openingBalance, subcategoryId: row.loan.subcategoryId },
            data: { openingBalance: row.openingBalance, subcategoryId: row.payment.subcategoryId } });
          if (changed.count !== 1) throw Error("Loan changed since audit; import cancelled");
          await tx.transaction.create({ data: row.payment });
          await tx.auditLog.create({ data: { userId: user.id, entityType: "Loan", entityId: row.loan.id,
            action: "SEPTEMBER_OPENING_CORRECTION_AND_PAYMENT", source: "USER_AUTHORIZED_IMPORT",
            previousValuesJson: JSON.stringify({ openingBalance: row.loan.openingBalance, subcategoryId: row.loan.subcategoryId }),
            newValuesJson: JSON.stringify({ openingBalance: row.openingBalance, subcategoryId: row.payment.subcategoryId,
              provenance: row.provenance, sourceKey: row.sourceKey }), relatedRecordIds: [row.payment.id] } });
        }
        const after = await snapshot(tx, user.id);
        const second = planSeptemberLoanImport(after);
        if (second.missing.length || second.probableDuplicates.length) throw Error("Second audit did not reach zero missing");
        for (const old of locked.loans) {
          const current = after.loans.find((l) => l.id === old.id);
          const imported = plan.missing.find((r) => r.loan.id === old.id);
          const expected = imported ? imported.endingBalance : balance(locked, old);
          if (!current || balance(after, current) !== expected) throw Error(`Unexpected loan balance: ${old.name}`);
          if (!imported && JSON.stringify(old) !== JSON.stringify(current)) throw Error(`Unrelated loan changed: ${old.name}`);
        }
        const expenseBefore = locked.transactions.filter((t) => t.type === "EXPENSE").reduce((sum, t) => sum + t.amount, 0);
        const expenseAfter = after.transactions.filter((t) => t.type === "EXPENSE").reduce((sum, t) => sum + t.amount, 0);
        const incomeBefore = locked.transactions.filter((t) => t.type === "INCOME").reduce((sum, t) => sum + t.amount, 0);
        const incomeAfter = after.transactions.filter((t) => t.type === "INCOME").reduce((sum, t) => sum + t.amount, 0);
        if (expenseBefore !== expenseAfter || incomeBefore !== incomeAfter) throw Error("Payments affected expense or income totals");
        console.log("Verified second audit", JSON.stringify(second));
        console.log("Verified loan balances", JSON.stringify(after.loans.map((l) => ({ name: l.name, balance: balance(after, l) }))));
        if (rollbackCheck) throw Error(rollbackSentinel);
      });
    } catch (error) {
      if (!rollbackCheck || error.message !== rollbackSentinel) throw error;
    }
    const final = await snapshot(p, user.id);
    if (rollbackCheck) {
      if (fingerprint(before) !== fingerprint(final)) throw Error("Rollback changed live records");
      console.log("Rollback verified: live loans and transactions unchanged.");
    } else {
      console.log("Committed. Post-import dry run", JSON.stringify(planSeptemberLoanImport(final)));
      console.log("Post-import balances", JSON.stringify(final.loans.map((l) => ({ name: l.name, balance: balance(final, l) }))));
    }
  }
} finally { await p.$disconnect(); }
