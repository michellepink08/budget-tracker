# Transaction Export — Design

**Status:** Approved by user, 2026-09-13

## Goal

Phase 9 of the Quick Capture roadmap: a server-side transaction export from Settings, in CSV, XLSX, and JSON, filterable the same way the Transactions page already filters (date range, account, category, type), always scoped to the authenticated user. No import — explicitly out of scope per the original request.

## Scope decision

Export covers **transactions only**, not every model family. Accounts, categories, payables, budgets etc. have no natural "date range" filter and aren't what "export my data" normally means for a personal finance app — the transaction ledger is. (Decided with the user directly, given the master design doc left the exact model list unresolved.)

## Context

`src/lib/transactions.ts`'s `listTransactions` already builds exactly the right `where` clause (`accountId`, `categoryId`, `type`, `search`, `dateFrom`/`dateTo`) but doesn't `include` related rows, so it returns raw `accountId`/`categoryId` foreign keys rather than names — export needs the names. Rather than duplicating the filter-building logic, `listTransactions`'s `where`-building gets extracted into a reusable `buildTransactionWhereClause(userId, filters)` function, used by both `listTransactions` (unchanged behavior) and the new export path (adds its own `include`). `Transaction.amount` is already stored signed per row (per `transaction-rules.ts`'s `accountEffect`) — export can use it directly, no re-deriving sign from `type`.

No XLSX library exists in this project yet — `exceljs` (MIT-licensed, the standard choice for generating `.xlsx` from Node) is added as a new dependency.

## Approach

### 1. `src/lib/transactions.ts` — extract the where-builder

```ts
export function buildTransactionWhereClause(userId: string, filters: TransactionFilters): Record<string, unknown> {
  const where: Record<string, unknown> = { userId };
  if (filters.accountId) where.accountId = filters.accountId;
  if (filters.categoryId) where.categoryId = filters.categoryId;
  if (filters.type) where.type = filters.type;
  if (filters.search) where.description = { contains: filters.search };
  if (filters.dateFrom || filters.dateTo) {
    where.date = {
      ...(filters.dateFrom ? { gte: filters.dateFrom } : {}),
      ...(filters.dateTo ? { lte: filters.dateTo } : {}),
    };
  }
  return where;
}

export async function listTransactions(prisma, userId, filters) {
  return prisma.transaction.findMany({ where: buildTransactionWhereClause(userId, filters), orderBy: { date: "desc" } });
}
```

Pure refactor — `listTransactions`'s existing tests and callers are unaffected.

### 2. `src/lib/export-transactions.ts` (new) — row-building

```ts
export type TransactionExportRow = {
  date: string;              // "YYYY-MM-DD"
  type: string;
  amountMajorUnits: number;  // signed, e.g. -180.00 for an expense
  currency: string;
  account: string;
  destinationAccount: string | null;
  category: string | null;
  description: string;
  notes: string | null;
};

export async function buildTransactionExportRows(
  prisma: Pick<PrismaClient, "transaction">,
  userId: string,
  filters: TransactionFilters,
): Promise<TransactionExportRow[]>
```

Queries `prisma.transaction.findMany` with `buildTransactionWhereClause(userId, filters)`, `orderBy: { date: "desc" }`, and `include: { account: true, destinationAccount: true, category: true }`; maps each row to a `TransactionExportRow` using the existing `toMajorUnits(amount, account.currency)` from `src/lib/money.ts`, formatting `date` as `date.toISOString().slice(0, 10)`.

### 3. `src/lib/export-format.ts` (new) — format serializers

```ts
export function toCsv(rows: TransactionExportRow[]): string
export function toJson(rows: TransactionExportRow[]): string
export async function toXlsx(rows: TransactionExportRow[]): Promise<Buffer>
```

- `toCsv`: a fixed header row (`date,type,amountMajorUnits,currency,account,destinationAccount,category,description,notes`) followed by one line per row; any field containing a comma, double quote, or newline is wrapped in double quotes with internal quotes doubled (standard CSV escaping) — a null field renders as an empty string, not the literal text `"null"`.
- `toJson`: `JSON.stringify(rows, null, 2)` — the rows are already plain serializable objects, no transformation needed.
- `toXlsx`: `exceljs`'s `Workbook`, one worksheet named `"Transactions"`, header row matching `toCsv`'s column order, one row per transaction, `amountMajorUnits` written as a real number (not a string) so it stays a working Excel-formula-friendly number; returns `workbook.xlsx.writeBuffer()` cast to `Buffer`.

### 4. `src/app/api/export/transactions/route.ts` (new) — the download endpoint

A `GET` route handler:
- `auth()` first; a missing session returns `401`.
- Query params: `format` (`csv`|`xlsx`|`json`, required — `400` on anything else), `accountId`, `categoryId`, `type`, `dateFrom`, `dateTo` (all optional, parsed the same way the Transactions page's own filter form already does — invalid dates are just ignored, not a hard error, matching this app's existing lenient-filter style).
- Calls `buildTransactionExportRows(prisma, session.user.id, filters)` — **`userId` always comes from the authenticated session, never from a query param** — then serializes via the requested format and returns a `NextResponse` with:
  - `csv`: `Content-Type: text/csv; charset=utf-8`, `Content-Disposition: attachment; filename="transactions.csv"`
  - `json`: `Content-Type: application/json; charset=utf-8`, `Content-Disposition: attachment; filename="transactions.json"`
  - `xlsx`: `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, `Content-Disposition: attachment; filename="transactions.xlsx"`

### 5. `src/components/settings/export-settings.tsx` (new) — the Settings UI

A plain `<form method="get" action="/api/export/transactions">` (no client JS needed — a GET form submission is itself a download when the response carries `Content-Disposition: attachment`, and this avoids inventing a new client-side download mechanism for something this simple):
- Format `<select name="format">` (CSV / XLSX / JSON).
- Date range: two `<input type="date" name="dateFrom">` / `name="dateTo">`.
- Account `<select name="accountId">` (options built from the `accounts` prop, plus "All accounts").
- Category `<select name="categoryId">` (options from `categories`, plus "All categories").
- Type `<select name="type">` (`EXPENSE`/`INCOME`/`TRANSFER`/`REFUND`/`CREDIT_CARD_PAYMENT`/`LOAN_PAYMENT` — the full set of `Transaction.type` values already in use across this codebase — plus "All types").
- A submit `<button type="submit">Export</button>`.

### 6. `src/app/(app)/settings/page.tsx` — wire it in

Add an "Export" section (alongside the existing Appearance/Categories/Recurring/Demo-data sections) rendering `<ExportSettings accounts={accounts} categories={categories} />` — `accounts`/`categories` are already fetched on this page for other sections, no new query needed.

## Data flow

```
Settings page → ExportSettings form (GET, browser-native submit)
  → /api/export/transactions?format=csv&accountId=...&dateFrom=...
  → auth() confirms session → buildTransactionExportRows(prisma, session.user.id, filters)
  → toCsv/toJson/toXlsx(rows) → NextResponse with Content-Disposition: attachment
  → browser downloads the file
```

## Testing

- `export-transactions.test.ts` (mocked Prisma): confirms the query is called with the right `where`/`include`, and that a returned row maps fields correctly (signed amount → major units, resolved account/category names, `destinationAccount` null for a non-transfer, formatted date string).
- `export-format.test.ts`: `toCsv` — header row, one data row, a value containing a comma and a value containing a double quote both come out correctly escaped, a `null` category renders as an empty field, not `"null"`. `toJson` — output parses back to an array with the expected shape. `toXlsx` — returns a non-empty `Buffer`; read it back with `exceljs` in the test itself and assert the worksheet name is `"Transactions"`, the header row matches, and one data row's values match an input row.
- No test for the route handler or the settings form component — thin plumbing/presentational, consistent with this codebase's existing convention (every prior phase's routes/forms were manually verified instead; the actual logic they call is what's unit-tested).
- Manual verification on the live deployment: from Settings, export with no filters in all three formats and confirm each downloads with sensible content; apply a date range and an account filter and confirm the exported rows are the filtered subset; confirm a transaction belonging to another user's account can never appear (verified structurally — the route always uses the session's own `userId`, never a client-supplied one).

## Out of scope

- Import (explicitly excluded by the original request).
- Exporting anything other than transactions (accounts, payables, budgets, etc.) — see Scope decision above.
- Any scheduled/automatic export or emailed backup — this is an on-demand download only.
- Compressing multiple formats into one archive — one format per request, matching the original request's "three formats" framing (pick one at a time), not "download everything at once."
