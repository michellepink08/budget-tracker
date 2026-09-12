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

// Clear this user's existing financial rows (children first).
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

const creditCard = await prisma.account.create({
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

const now = new Date();
const budgetPeriod = await prisma.budgetPeriod.create({
  data: {
    userId: user.id,
    name: "Current cycle",
    startDate: new Date(now.getFullYear(), now.getMonth(), 1),
    endDate: new Date(now.getFullYear(), now.getMonth() + 1, 0),
    status: "ACTIVE",
  },
});

// Budget allocations (planned amounts per category) are Plan 3A —
// BudgetAllocation doesn't exist yet, so this seed only creates the
// period itself plus transactions against it.

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
