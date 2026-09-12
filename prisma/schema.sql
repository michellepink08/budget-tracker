-- Hand-written mirror of prisma/schema.prisma's tables.
--
-- Why this file exists: `prisma db push` / `prisma migrate` shell out to a
-- native schema-engine binary, which this machine's Application Control
-- policy blocks from running. Prisma Client itself works fine here via the
-- @prisma/adapter-better-sqlite3 driver adapter (an in-process native
-- addon, not a spawned .exe), so we apply schema changes with this file
-- + `npm run db:push` (scripts/db-push.mjs) instead of Prisma's CLI.
--
-- Rule going forward: whenever you add/change a model in schema.prisma,
-- make the matching change here too, then run `npm run db:push`.
-- Statements must be idempotent (IF NOT EXISTS) since this script re-runs
-- against an existing database on every call. Changing an existing
-- column's type/constraints isn't handled automatically — in dev, delete
-- prisma/dev.db and re-run `npm run db:push` to rebuild from scratch.

CREATE TABLE IF NOT EXISTS "User" (
  "id"            TEXT     NOT NULL PRIMARY KEY,
  "email"         TEXT     NOT NULL UNIQUE,
  "passwordHash"  TEXT     NOT NULL,
  "cycleStartDay" INTEGER  NOT NULL DEFAULT 1,
  "currency"      TEXT     NOT NULL DEFAULT 'PHP',
  "accentColor"   TEXT     NOT NULL DEFAULT 'coral',
  "themeMode"     TEXT     NOT NULL DEFAULT 'system',
  "createdAt"     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "onboardedAt"   DATETIME
);

CREATE TABLE IF NOT EXISTS "Account" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "accountType" TEXT NOT NULL,
  "openingBalance" INTEGER NOT NULL DEFAULT 0,
  "currency" TEXT NOT NULL DEFAULT 'PHP',
  "includeInLiquidFunds" INTEGER NOT NULL DEFAULT 1,
  "isPrimaryFundingAccount" INTEGER NOT NULL DEFAULT 0,
  "color" TEXT NOT NULL,
  "icon" TEXT NOT NULL,
  "archivedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("userId") REFERENCES "User" ("id")
);
CREATE INDEX IF NOT EXISTS "Account_userId_idx" ON "Account" ("userId");

CREATE TABLE IF NOT EXISTS "Category" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "color" TEXT NOT NULL,
  "icon" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "archivedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("userId") REFERENCES "User" ("id")
);
CREATE INDEX IF NOT EXISTS "Category_userId_idx" ON "Category" ("userId");

CREATE TABLE IF NOT EXISTS "Subcategory" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "categoryId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "archivedAt" DATETIME,
  FOREIGN KEY ("userId") REFERENCES "User" ("id"),
  FOREIGN KEY ("categoryId") REFERENCES "Category" ("id")
);
CREATE INDEX IF NOT EXISTS "Subcategory_categoryId_idx" ON "Subcategory" ("categoryId");

CREATE TABLE IF NOT EXISTS "BudgetPeriod" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "startDate" DATETIME NOT NULL,
  "endDate" DATETIME NOT NULL,
  "status" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("userId") REFERENCES "User" ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "BudgetPeriod_userId_startDate_key" ON "BudgetPeriod" ("userId", "startDate");

CREATE TABLE IF NOT EXISTS "BudgetAllocation" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "budgetPeriodId" TEXT NOT NULL,
  "categoryId" TEXT NOT NULL,
  "plannedAmount" INTEGER NOT NULL,
  "rolloverMode" TEXT NOT NULL,
  "rolloverAmount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("userId") REFERENCES "User" ("id"),
  FOREIGN KEY ("budgetPeriodId") REFERENCES "BudgetPeriod" ("id"),
  FOREIGN KEY ("categoryId") REFERENCES "Category" ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "BudgetAllocation_budgetPeriodId_categoryId_key" ON "BudgetAllocation" ("budgetPeriodId", "categoryId");

CREATE TABLE IF NOT EXISTS "Transaction" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "date" DATETIME NOT NULL,
  "type" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "accountId" TEXT NOT NULL,
  "destinationAccountId" TEXT,
  "categoryId" TEXT,
  "subcategoryId" TEXT,
  "budgetPeriodId" TEXT,
  "description" TEXT NOT NULL,
  "notes" TEXT,
  "status" TEXT NOT NULL DEFAULT 'CLEARED',
  "linkedTransactionId" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("userId") REFERENCES "User" ("id"),
  FOREIGN KEY ("accountId") REFERENCES "Account" ("id"),
  FOREIGN KEY ("destinationAccountId") REFERENCES "Account" ("id"),
  FOREIGN KEY ("categoryId") REFERENCES "Category" ("id"),
  FOREIGN KEY ("subcategoryId") REFERENCES "Subcategory" ("id"),
  FOREIGN KEY ("budgetPeriodId") REFERENCES "BudgetPeriod" ("id")
);
CREATE INDEX IF NOT EXISTS "Transaction_userId_idx" ON "Transaction" ("userId");
CREATE INDEX IF NOT EXISTS "Transaction_accountId_idx" ON "Transaction" ("accountId");
CREATE INDEX IF NOT EXISTS "Transaction_destinationAccountId_idx" ON "Transaction" ("destinationAccountId");
CREATE INDEX IF NOT EXISTS "Transaction_budgetPeriodId_idx" ON "Transaction" ("budgetPeriodId");

CREATE TABLE IF NOT EXISTS "RecurringRule" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "transactionType" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "frequency" TEXT NOT NULL,
  "intervalDays" INTEGER,
  "nextDate" DATETIME NOT NULL,
  "accountId" TEXT NOT NULL,
  "categoryId" TEXT,
  "subcategoryId" TEXT,
  "active" INTEGER NOT NULL DEFAULT 1,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("userId") REFERENCES "User" ("id"),
  FOREIGN KEY ("accountId") REFERENCES "Account" ("id"),
  FOREIGN KEY ("categoryId") REFERENCES "Category" ("id"),
  FOREIGN KEY ("subcategoryId") REFERENCES "Subcategory" ("id")
);
CREATE INDEX IF NOT EXISTS "RecurringRule_userId_idx" ON "RecurringRule" ("userId");
