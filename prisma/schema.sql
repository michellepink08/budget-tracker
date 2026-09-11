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
  "createdAt"     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
