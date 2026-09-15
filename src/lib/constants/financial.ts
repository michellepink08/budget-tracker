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

export const ACCOUNT_PURPOSES = ["DISPOSABLE", "SAVINGS", "RESTRICTED", "CREDIT", "DEBT"] as const;
export type AccountPurpose = (typeof ACCOUNT_PURPOSES)[number];

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
  "LENDING",
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

export const PAYABLE_STATUSES = ["PENDING", "PAID"] as const;
export type PayableStatus = (typeof PAYABLE_STATUSES)[number];

export const YEAR_PLAN_PHASE_TYPES = [
  "FULL_ONBOARD",
  "PARTIAL_ONBOARD",
  "TRANSITION_HOME",
  "HOME_SALARY_ONLY",
  "EXPECTED_RETURN",
  "PARTIAL_RETURN",
  "CUSTOM",
] as const;
export type YearPlanPhaseType = (typeof YEAR_PLAN_PHASE_TYPES)[number];

// Phases whose cutoffs are "home" cutoffs for reserve-math purposes (Decision:
// only these two count toward computeRequiredReserve's cumulative walk).
export const HOME_PHASE_TYPES: readonly YearPlanPhaseType[] = ["HOME_SALARY_ONLY", "TRANSITION_HOME"];

export const INCOME_FORECAST_SOURCES = [
  "MY_SALARY",
  "MY_BONUS",
  "HUSBAND_SALARY",
  "ALLOTMENT",
  "PARTIAL_SALARY",
  "FINAL_SALARY",
  "CASH_BOND",
  "OTHER",
] as const;
export type IncomeForecastSource = (typeof INCOME_FORECAST_SOURCES)[number];

// Sources counted as "reliable income" in the reserve math (design doc:
// MY_SALARY + ALLOTMENT only).
export const RELIABLE_INCOME_SOURCES: readonly IncomeForecastSource[] = ["MY_SALARY", "ALLOTMENT"];

export const INCOME_FORECAST_STATUSES = ["CONFIRMED", "EXPECTED", "ESTIMATED", "UNCERTAIN"] as const;
export type IncomeForecastStatus = (typeof INCOME_FORECAST_STATUSES)[number];

// Statuses counted as "reliable" (design doc: CONFIRMED/EXPECTED only —
// ESTIMATED/UNCERTAIN lines are shown but excluded from reliable income).
export const RELIABLE_INCOME_STATUSES: readonly IncomeForecastStatus[] = ["CONFIRMED", "EXPECTED"];

export const SHOPPING_ITEM_PRIORITIES = ["LOW", "NORMAL", "HIGH"] as const;
export type ShoppingItemPriority = (typeof SHOPPING_ITEM_PRIORITIES)[number];

export const PRICE_SOURCES = ["MANUAL", "RECEIPT"] as const; // RECEIPT unused until Plan 24
export type PriceSource = (typeof PRICE_SOURCES)[number];
