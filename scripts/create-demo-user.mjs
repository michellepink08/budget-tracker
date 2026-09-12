// Creates (or resets the password for) a demo user for local testing.
//
// Usage: node scripts/create-demo-user.mjs [email] [password]
// Defaults to demo@example.com / demopassword123

import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

const email = process.argv[2] ?? "demo@example.com";
const password = process.argv[3] ?? "demopassword123";

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const passwordHash = await bcrypt.hash(password, 10);

const user = await prisma.user.upsert({
  where: { email },
  update: { passwordHash },
  create: { email, passwordHash },
});

console.log(`Demo user ready: ${user.email} / ${password}`);

await prisma.$disconnect();
