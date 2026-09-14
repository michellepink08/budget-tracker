import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";

// Neon's driver needs a WebSocket implementation. The edge runtime has a
// native `WebSocket` global; Vercel's Node.js runtime (what this app
// actually runs on) does not, so it's polyfilled with `ws`.
neonConfig.webSocketConstructor = ws;

// Route queries over HTTP fetch instead of holding a persistent WebSocket
// open. This module's `prisma` singleton is reused across requests within
// the same warm serverless function — a held-open WebSocket can get
// silently severed by the platform while the function is frozen between
// invocations, so the next request fails with "Connection terminated
// unexpectedly" against a dead socket. Fetch-per-query has no such
// connection to go stale.
neonConfig.poolQueryViaFetch = true;

// Uses Neon's driver adapter — pure JS, like the SQLite adapter it
// replaces, so it never needs the native schema-engine/query-engine
// binaries this machine's Application Control policy blocks.
function createPrismaClient() {
  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({
    adapter,
    // Neon's serverless Postgres can suspend its compute when idle; waking
    // it back up plus the WebSocket handshake for a new connection can
    // take longer than Prisma's 2s/5s defaults, which was surfacing as
    // "Transaction API error: Unable to start a transaction in the given
    // time" (P2028) on every interactive $transaction (transfers, credit
    // card payments, receipt confirmation, etc.) whenever the compute had
    // gone idle.
    transactionOptions: { maxWait: 10000, timeout: 15000 },
  });
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
