import type { PrismaClient } from "@prisma/client";
import { createAccount } from "@/lib/accounts";
import { createCategory } from "@/lib/categories";
import { createExpenseLikeTransaction, createTransferTransaction } from "@/lib/transactions";

function daysAgo(n: number): Date {
  const dt = new Date();
  dt.setDate(dt.getDate() - n);
  return dt;
}

// Fictional demo dataset — every name, account, and amount here is made
// up (no real personal financial data). Built entirely from this app's
// own domain functions (not raw prisma.create calls), so every
// transaction's budget period is resolved through the real
// resolveBudgetPeriodForDate/cycleStartDay machinery — this can never
// disagree with the app's own idea of "the current cycle" the way the
// old hardcoded-calendar-month CLI seed did.
export async function seedDemoData(
  prisma: PrismaClient,
  userId: string,
  cycleStartDay: number,
): Promise<void> {
  // Clear this user's existing rows first, children before parents.
  await prisma.installmentPayment.deleteMany({ where: { userId } });
  await prisma.installmentPurchase.deleteMany({ where: { userId } });
  await prisma.payable.deleteMany({ where: { userId } });
  await prisma.recurringPayable.deleteMany({ where: { userId } });
  await prisma.recurringRule.deleteMany({ where: { userId } });
  await prisma.creditCard.deleteMany({ where: { userId } });
  await prisma.loan.deleteMany({ where: { userId } });
  await prisma.budgetAllocation.deleteMany({ where: { userId } });
  await prisma.transaction.deleteMany({ where: { userId } });
  await prisma.budgetPeriod.deleteMany({ where: { userId } });
  await prisma.subcategory.deleteMany({ where: { userId } });
  await prisma.category.deleteMany({ where: { userId } });
  await prisma.account.deleteMany({ where: { userId } });

  const checking = await createAccount(prisma, userId, {
    name: "Everyday Checking",
    accountType: "CHECKING",
    openingBalance: 4500000, // ₱45,000.00
    currency: "PHP",
    purpose: "DISPOSABLE",
    isPrimaryFundingAccount: true,
    color: "blue",
    icon: "landmark",
  });

  const savings = await createAccount(prisma, userId, {
    name: "Rainy Day Savings",
    accountType: "SAVINGS",
    openingBalance: 12000000, // ₱120,000.00
    currency: "PHP",
    purpose: "SAVINGS",
    isPrimaryFundingAccount: false,
    color: "green",
    icon: "piggy-bank",
  });

  await createAccount(prisma, userId, {
    name: "Everyday Rewards Card",
    accountType: "CREDIT_CARD",
    openingBalance: -850000, // owes ₱8,500.00
    currency: "PHP",
    purpose: "CREDIT",
    isPrimaryFundingAccount: false,
    color: "purple",
    icon: "credit-card",
  });

  const categoryDefs = [
    { key: "salary", name: "Salary", type: "INCOME", color: "green", icon: "wallet" },
    { key: "groceries", name: "Groceries", type: "EXPENSE", color: "coral", icon: "shopping-cart" },
    { key: "rent", name: "Rent", type: "EXPENSE", color: "neutral", icon: "home" },
    { key: "dining", name: "Dining Out", type: "EXPENSE", color: "coral", icon: "utensils" },
    { key: "transport", name: "Transport", type: "EXPENSE", color: "blue", icon: "car" },
    { key: "entertainment", name: "Entertainment", type: "EXPENSE", color: "purple", icon: "film" },
  ] as const;

  const categories: Record<string, { id: string }> = {};
  for (const { key, ...def } of categoryDefs) {
    categories[key] = await createCategory(prisma, userId, def);
  }

  await createExpenseLikeTransaction(prisma, userId, cycleStartDay, {
    type: "INCOME",
    amount: 3500000,
    date: daysAgo(10),
    accountId: checking.id,
    categoryId: categories.salary.id,
    description: "Monthly salary",
  });

  await createExpenseLikeTransaction(prisma, userId, cycleStartDay, {
    type: "EXPENSE",
    amount: 1500000,
    date: daysAgo(9),
    accountId: checking.id,
    categoryId: categories.rent.id,
    description: "Rent payment",
  });

  await createExpenseLikeTransaction(prisma, userId, cycleStartDay, {
    type: "EXPENSE",
    amount: 320000,
    date: daysAgo(7),
    accountId: checking.id,
    categoryId: categories.groceries.id,
    description: "Weekly groceries",
  });

  await createExpenseLikeTransaction(prisma, userId, cycleStartDay, {
    type: "EXPENSE",
    amount: 95000,
    date: daysAgo(5),
    accountId: checking.id,
    categoryId: categories.dining.id,
    description: "Dinner with friends",
  });

  await createExpenseLikeTransaction(prisma, userId, cycleStartDay, {
    type: "REFUND",
    amount: 25000,
    date: daysAgo(4),
    accountId: checking.id,
    categoryId: categories.groceries.id,
    description: "Refund for returned item",
  });

  await createExpenseLikeTransaction(prisma, userId, cycleStartDay, {
    type: "CREDIT_CARD_PAYMENT",
    amount: 300000,
    date: daysAgo(6),
    accountId: checking.id,
    description: "Credit card payment",
  });

  await createTransferTransaction(prisma, userId, cycleStartDay, {
    amount: 500000,
    date: daysAgo(3),
    sourceAccountId: checking.id,
    destinationAccountId: savings.id,
    description: "Move to savings",
  });
}
