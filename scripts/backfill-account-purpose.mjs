// Reclassifies existing accounts' `purpose` column, which `prisma db push`
// populates with a flat "DISPOSABLE" default for every pre-existing row.
// This backfill applies the same signals the design doc specifies:
//   accountType "CREDIT_CARD"                              -> CREDIT
//   accountType "LOAN"                                      -> DEBT
//   includeInLiquidFunds: false (and not the above)         -> RESTRICTED
//   everything else                                         -> stays DISPOSABLE
// Idempotent — safe to re-run at any time.
//
// Usage: node scripts/backfill-account-purpose.mjs
// Run this once, after `npm run db:push`, against the real production
// DATABASE_URL (this repo's local .env does not have a working one).

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const creditCards = await prisma.account.updateMany({
  where: { accountType: "CREDIT_CARD" },
  data: { purpose: "CREDIT" },
});
const loans = await prisma.account.updateMany({
  where: { accountType: "LOAN" },
  data: { purpose: "DEBT" },
});
const restricted = await prisma.account.updateMany({
  where: {
    includeInLiquidFunds: false,
    accountType: { notIn: ["CREDIT_CARD", "LOAN"] },
  },
  data: { purpose: "RESTRICTED" },
});

console.log(`Reclassified ${creditCards.count} credit card account(s) as CREDIT`);
console.log(`Reclassified ${loans.count} loan account(s) as DEBT`);
console.log(`Reclassified ${restricted.count} restricted-fund account(s) as RESTRICTED`);
console.log("Every other account keeps the pushed default: DISPOSABLE");

await prisma.$disconnect();
