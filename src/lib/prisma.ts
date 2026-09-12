import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";

// Neon's driver needs a WebSocket implementation. The edge runtime has a
// native `WebSocket` global; Vercel's Node.js runtime (what this app
// actually runs on) does not, so it's polyfilled with `ws`.
neonConfig.webSocketConstructor = ws;

// Uses Neon's WebSocket-based driver adapter — avoids holding pooled TCP
// connections across Vercel's serverless cold starts, and (like the
// SQLite adapter it replaces) is pure JS, so it never needs the native
// schema-engine/query-engine binaries this machine's Application Control
// policy blocks.
function createPrismaClient() {
  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
