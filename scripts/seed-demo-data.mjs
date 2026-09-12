// Seeds fictional financial data for the demo account (for portfolio
// screenshots/demoing). Safe to re-run: clears the demo user's existing
// financial rows first, then re-inserts. Only ever touches the account
// belonging to DEMO_EMAIL — never real user data. Every name/amount here
// is made up.

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const DEMO_EMAIL = "demo@example.com";

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL ?? "file:./prisma/dev.db",
});
const prisma = new PrismaClient({ adapter });

const user = await prisma.user.findUnique({ where: { email: DEMO_EMAIL } });
if (!user) {
  console.error(`No user found for ${DEMO_EMAIL}. Run "npm run db:demo-user" first.`);
  process.exit(1);
}

// Clear this user's existing financial rows, children first. Every table
// added since this script was first written (Plans 3A/3B) needs a delete
// here too, or re-running this script fails on a foreign-key constraint
// the moment any of those rows exist.
await prisma.installmentPayment.deleteMany({ where: { userId: user.id } });
await prisma.installmentPurchase.deleteMany({ where: { userId: user.id } });
await prisma.payable.deleteMany({ where: { userId: user.id } });
await prisma.recurringPayable.deleteMany({ where: { userId: user.id } });
await prisma.recurringRule.deleteMany({ where: { userId: user.id } });
await prisma.creditCard.deleteMany({ where: { userId: user.id } });
await prisma.loan.deleteMany({ where: { userId: user.id } });
await prisma.budgetAllocation.deleteMany({ where: { userId: user.id } });
await prisma.transaction.deleteMany({ where: { userId: user.id } });
await prisma.budgetPeriod.deleteMany({ where: { userId: user.id } });
await prisma.subcategory.deleteMany({ where: { userId: user.id } });
await prisma.category.deleteMany({ where: { userId: user.id } });
await prisma.account.deleteMany({ where: { userId: user.id } });

const checking = await prisma.account.create({
  data: {
    userId: user.id,
    name: "Everyday Checking",
    accountType: "CHECKING",
    openingBalance: 4500000, // ₱45,000.00
    currency: "PHP",
    includeInLiquidFunds: true,
    isPrimaryFundingAccount: true,
    color: "blue",
    icon: "landmark",
  },
});

const savings = await prisma.account.create({
  data: {
    userId: user.id,
    name: "Rainy Day Savings",
    accountType: "SAVINGS",
    openingBalance: 12000000, // ₱120,000.00
    currency: "PHP",
    includeInLiquidFunds: true,
    color: "green",
    icon: "piggy-bank",
  },
});

await prisma.account.create({
  data: {
    userId: user.id,
    name: "Everyday Rewards Card",
    accountType: "CREDIT_CARD",
    openingBalance: -850000, // owes ₱8,500.00
    currency: "PHP",
    includeInLiquidFunds: false,
    color: "purple",
    icon: "credit-card",
  },
});

const categoryDefs = {
  salary: { name: "Salary", type: "INCOME", color: "green", icon: "wallet" },
  groceries: { name: "Groceries", type: "EXPENSE", color: "coral", icon: "shopping-cart" },
  rent: { name: "Rent", type: "EXPENSE", color: "neutral", icon: "home" },
  dining: { name: "Dining Out", type: "EXPENSE", color: "coral", icon: "utensils" },
  transport: { name: "Transport", type: "EXPENSE", color: "blue", icon: "car" },
  entertainment: { name: "Entertainment", type: "EXPENSE", color: "purple", icon: "film" },
};

const categories = {};
for (const [key, def] of Object.entries(categoryDefs)) {
  categories[key] = await prisma.category.create({ data: { userId: user.id, ...def } });
}

// This CLI script runs standalone via plain `node`, with no build step,
// so it can't import src/lib/cycle.ts directly — it keeps this small,
// self-contained mirror of getCycleForDate's algorithm instead, scoped to
// just the one case this script needs ("the cycle containing today").
// Keep this in sync with src/lib/cycle.ts by hand if that logic changes —
// the same deliberate-duplication tradeoff already accepted for
// prisma/schema.sql mirroring prisma/schema.prisma.
function daysInMonth(year, monthIndex0) {
  return new Date(year, monthIndex0 + 1, 0).getDate();
}

function cycleContainingToday(cycleStartDay) {
  const today = new Date();
  const year = today.getFullYear();
  const monthIndex0 = today.getMonth();
  const day = today.getDate();
  const effectiveStartDay = Math.min(cycleStartDay, daysInMonth(year, monthIndex0));

  let startYear = year;
  let startMonth = monthIndex0;
  if (day < effectiveStartDay) {
    startMonth -= 1;
    if (startMonth < 0) {
      startMonth = 11;
      startYear -= 1;
    }
  }
  const clampedStartDay = Math.min(cycleStartDay, daysInMonth(startYear, startMonth));
  const start = new Date(startYear, startMonth, clampedStartDay);

  let endMonth = startMonth + 1;
  let endYear = startYear;
  if (endMonth > 11) {
    endMonth = 0;
    endYear += 1;
  }
  const clampedEndDay = Math.min(cycleStartDay, daysInMonth(endYear, endMonth));
  const end = new Date(endYear, endMonth, clampedEndDay - 1);

  return { start, end };
}

const { start, end } = cycleContainingToday(user.cycleStartDay);
const budgetPeriod = await prisma.budgetPeriod.create({
  data: {
    userId: user.id,
    name: `${start.toLocaleDateString()} – ${end.toLocaleDateString()}`,
    startDate: start,
    endDate: end,
    status: "ACTIVE",
  },
});

function daysAgo(n) {
  const dt = new Date();
  dt.setDate(dt.getDate() - n);
  return dt;
}

await prisma.transaction.create({
  data: {
    userId: user.id,
    date: daysAgo(10),
    type: "INCOME",
    amount: 3500000,
    accountId: checking.id,
    categoryId: categories.salary.id,
    budgetPeriodId: budgetPeriod.id,
    description: "Monthly salary",
  },
});

await prisma.transaction.create({
  data: {
    userId: user.id,
    date: daysAgo(9),
    type: "EXPENSE",
    amount: -1500000,
    accountId: checking.id,
    categoryId: categories.rent.id,
    budgetPeriodId: budgetPeriod.id,
    description: "Rent payment",
  },
});

await prisma.transaction.create({
  data: {
    userId: user.id,
    date: daysAgo(7),
    type: "EXPENSE",
    amount: -320000,
    accountId: checking.id,
    categoryId: categories.groceries.id,
    budgetPeriodId: budgetPeriod.id,
    description: "Weekly groceries",
  },
});

await prisma.transaction.create({
  data: {
    userId: user.id,
    date: daysAgo(5),
    type: "EXPENSE",
    amount: -95000,
    accountId: checking.id,
    categoryId: categories.dining.id,
    budgetPeriodId: budgetPeriod.id,
    description: "Dinner with friends",
  },
});

await prisma.transaction.create({
  data: {
    userId: user.id,
    date: daysAgo(4),
    type: "REFUND",
    amount: 25000,
    accountId: checking.id,
    categoryId: categories.groceries.id,
    budgetPeriodId: budgetPeriod.id,
    description: "Refund for returned item",
  },
});

await prisma.transaction.create({
  data: {
    userId: user.id,
    date: daysAgo(6),
    type: "CREDIT_CARD_PAYMENT",
    amount: -300000,
    accountId: checking.id,
    budgetPeriodId: budgetPeriod.id,
    description: "Credit card payment",
  },
});

// A transfer: two linked rows sharing linkedTransactionId (see src/lib/transfers.ts).
const transferOut = await prisma.transaction.create({
  data: {
    userId: user.id,
    date: daysAgo(3),
    type: "TRANSFER",
    amount: -500000,
    accountId: checking.id,
    destinationAccountId: savings.id,
    budgetPeriodId: budgetPeriod.id,
    description: "Move to savings",
  },
});
const transferIn = await prisma.transaction.create({
  data: {
    userId: user.id,
    date: daysAgo(3),
    type: "TRANSFER",
    amount: 500000,
    accountId: savings.id,
    destinationAccountId: checking.id,
    budgetPeriodId: budgetPeriod.id,
    description: "Move to savings",
    linkedTransactionId: transferOut.id,
  },
});
await prisma.transaction.update({
  where: { id: transferOut.id },
  data: { linkedTransactionId: transferIn.id },
});

// Recurring rules are Plan 3A — RecurringRule doesn't exist yet.

console.log(`Seeded fictional demo data for ${DEMO_EMAIL}.`);

await prisma.$disconnect();
