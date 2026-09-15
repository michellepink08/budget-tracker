import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws;
neonConfig.poolQueryViaFetch = true;

const emailIndex = process.argv.indexOf("--user-email");
const userEmail = emailIndex >= 0 ? process.argv[emailIndex + 1] : undefined;
const apply = process.argv.includes("--apply");

if (!userEmail) {
  console.error("Usage: node scripts/repair-loan-subcategories.mjs --user-email <email> [--apply]");
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL }) });

try {
  const user = await prisma.user.findUnique({ where: { email: userEmail } });
  if (!user) {
    console.error(`No user found for ${userEmail}`);
    process.exitCode = 1;
  } else {
    const loanCategory = await prisma.category.findFirst({ where: { userId: user.id, name: "Loan" } });
    if (!loanCategory) {
      console.error("No Loan category found");
      process.exitCode = 1;
    } else {
      const loans = await prisma.loan.findMany({ where: { userId: user.id, archivedAt: null }, orderBy: { createdAt: "asc" } });
      let repaired = 0;
      for (const loan of loans) {
        const current = await prisma.subcategory.findFirst({ where: { userId: user.id, categoryId: loanCategory.id, name: loan.name } });
        const target = current ?? (apply
          ? await prisma.subcategory.create({ data: { userId: user.id, categoryId: loanCategory.id, name: loan.name } })
          : { id: "<new-subcategory>" });
        const alreadyCorrect = loan.categoryId === loanCategory.id && loan.subcategoryId === target.id;
        console.log(`${alreadyCorrect ? "OK" : apply ? "UPDATED" : "WOULD UPDATE"}: ${loan.name} -> ${target.id}`);
        if (!alreadyCorrect && apply) {
          await prisma.loan.update({ where: { id: loan.id }, data: { categoryId: loanCategory.id, subcategoryId: target.id } });
          repaired += 1;
        }
      }
      console.log(apply ? `Repaired ${repaired} loan(s).` : "Dry run only. Add --apply to make changes.");
    }
  }
} finally {
  await prisma.$disconnect();
}
