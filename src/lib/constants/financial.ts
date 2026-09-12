// SQLite has no enum type, so Prisma can't declare `enum` blocks against
// this datasource — every "one of a fixed set" column below is a plain
// String in the schema. These const arrays are the single source of truth
// for each fixed value set; zod schemas and UI option lists both import
// from here instead of re-listing the values.

export const ACCOUNT_TYPES = [
  "CASH",
  "CHECKING",
  "SAVINGS",
  "EWALLET",
  "CREDIT_CARD",
  "LOAN",
  "INVESTMENT",
  "EXCLUDED_FUND",
] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const CATEGORY_TYPES = ["INCOME", "EXPENSE", "SAVINGS", "DEBT_PAYMENT"] as const;
export type CategoryType = (typeof CATEGORY_TYPES)[number];

export const TRANSACTION_TYPES = [
  "EXPENSE",
  "INCOME",
  "TRANSFER",
  "REFUND",
  "SAVINGS",
  "LOAN_PAYMENT",
  "CREDIT_CARD_PAYMENT",
  "BALANCE_ADJUSTMENT",
  "TRANSFER_FEE",
] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export const TRANSACTION_STATUSES = ["PENDING", "CLEARED"] as const;
export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number];

export const BUDGET_PERIOD_STATUSES = ["UPCOMING", "ACTIVE", "CLOSED"] as const;
export type BudgetPeriodStatus = (typeof BUDGET_PERIOD_STATUSES)[number];

export const ROLLOVER_MODES = ["NONE", "CARRY_UNUSED", "CARRY_OVERSPEND", "CARRY_BOTH"] as const;
export type RolloverMode = (typeof ROLLOVER_MODES)[number];

export const RECURRING_FREQUENCIES = ["WEEKLY", "MONTHLY", "CUSTOM"] as const;
export type RecurringFrequency = (typeof RECURRING_FREQUENCIES)[number];
