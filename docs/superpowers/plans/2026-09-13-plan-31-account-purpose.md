# Account Purpose Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Phase 20.4 of the account-grouping roadmap — add `Account.purpose` (Disposable/Savings/Restricted/Credit/Debt) as the authoritative, independent-of-`accountType` classification, derive `includeInLiquidFunds` from it, migrate every domain function that currently keys off `includeInLiquidFunds`/`accountType` to key off `purpose` instead, and replace the account form's restricted-fund checkbox with a purpose selector.

**Design reference:** `docs/superpowers/specs/2026-09-13-major-features-design.md` section B. **Depends on:** nothing from other in-progress phases.

**Architecture decision (resolving the roadmap's own open question):** `purpose` becomes the *sole* filter every domain function reads — `computeLiquidFunds`, `listRestrictedFundGroups`, and `getRecommendedFundingTransfer` all switch from `includeInLiquidFunds`/`accountType` checks to `purpose` checks, with no transition window where both signals are read. `includeInLiquidFunds` stays as a column (nothing currently reads it once this phase ships, but dropping it isn't needed to satisfy any requirement and removing it would be an unrelated cleanup outside this phase's scope) and is now **fully derived, never client-supplied**: `createAccount`/`updateAccount` compute it from `purpose` themselves, so it can never diverge from the account's actual purpose.

**Migration reality:** This repo has no Prisma migrations directory (`prisma db push` only) and no working `DATABASE_URL` in the local `.env` (a known, pre-existing limitation — see the accent-color-removal phase's notes). Every schema/data change in this plan is written out precisely, but **the user must run `npm run db:push` and the new backfill script themselves** against the real production database; this plan cannot execute either step from this environment.

---

### Task 1: Schema — add `Account.purpose`, `ACCOUNT_PURPOSES` constant

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `src/lib/constants/financial.ts`

- [ ] **Step 1: Add the column**

In `prisma/schema.prisma`'s `model Account`, add:

```prisma
  purpose                 String    @default("DISPOSABLE")
```

right after `includeInLiquidFunds`.

- [ ] **Step 2: Add the constant**

In `src/lib/constants/financial.ts`, add:

```ts
export const ACCOUNT_PURPOSES = ["DISPOSABLE", "SAVINGS", "RESTRICTED", "CREDIT", "DEBT"] as const;
export type AccountPurpose = (typeof ACCOUNT_PURPOSES)[number];
```

- [ ] **Step 3: Commit**

```bash
git add prisma/schema.prisma src/lib/constants/financial.ts
git commit -m "feat(accounts): add Account.purpose and the ACCOUNT_PURPOSES constant

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Backfill script for existing accounts

**Files:**
- Create: `scripts/backfill-account-purpose.mjs`
- Modify: `package.json` (add an npm script)

- [ ] **Step 1: Write the script**

```js
// Reclassifies existing accounts' `purpose` column, which `prisma db push`
// populates with a flat "DISPOSABLE" default for every pre-existing row.
// This backfill applies the same signals the design doc specifies:
//   accountType "CREDIT_CARD"                              -> CREDIT
//   accountType "LOAN"                                      -> DEBT
//   includeInLiquidFunds: false (and not the above)         -> RESTRICTED
//   everything else                                         -> stays DISPOSABLE
// Idempotent — safe to re-run at any time.
//
// Usage: node scripts/backfill-account-purpose.mjs
// Run this once, after `npm run db:push`, against the real production
// DATABASE_URL (this repo's local .env does not have a working one).

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const creditCards = await prisma.account.updateMany({
  where: { accountType: "CREDIT_CARD" },
  data: { purpose: "CREDIT" },
});
const loans = await prisma.account.updateMany({
  where: { accountType: "LOAN" },
  data: { purpose: "DEBT" },
});
const restricted = await prisma.account.updateMany({
  where: {
    includeInLiquidFunds: false,
    accountType: { notIn: ["CREDIT_CARD", "LOAN"] },
  },
  data: { purpose: "RESTRICTED" },
});

console.log(`Reclassified ${creditCards.count} credit card account(s) as CREDIT`);
console.log(`Reclassified ${loans.count} loan account(s) as DEBT`);
console.log(`Reclassified ${restricted.count} restricted-fund account(s) as RESTRICTED`);
console.log("Every other account keeps the pushed default: DISPOSABLE");

await prisma.$disconnect();
```

- [ ] **Step 2: Add the npm script**

In `package.json`'s `"scripts"`, add:

```json
    "db:backfill-account-purpose": "node scripts/backfill-account-purpose.mjs",
```

- [ ] **Step 3: Commit**

```bash
git add scripts/backfill-account-purpose.mjs package.json
git commit -m "chore: add the Account.purpose backfill script

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: `src/lib/accounts.ts` — derive `includeInLiquidFunds` from `purpose`

**Files:**
- Modify: `src/lib/accounts.ts`
- Modify: `src/lib/accounts.test.ts`

- [ ] **Step 1: Write the failing tests**

Replace `SAMPLE_INPUT` and the `createAccount`/`updateAccount` describe blocks in `src/lib/accounts.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { archiveAccount, createAccount, listAccounts, updateAccount } from "@/lib/accounts";

const SAMPLE_INPUT = {
  name: "Everyday Checking",
  accountType: "CHECKING",
  openingBalance: 100000,
  currency: "PHP",
  purpose: "DISPOSABLE" as const,
  isPrimaryFundingAccount: false,
  color: "blue",
  icon: "landmark",
};

describe("createAccount", () => {
  it("creates an account scoped to the given user, deriving includeInLiquidFunds from purpose", async () => {
    const create = vi.fn().mockResolvedValue({ id: "acc-1" });
    const prisma = { account: { create } } as any;

    await createAccount(prisma, "user-1", SAMPLE_INPUT);

    expect(create).toHaveBeenCalledWith({
      data: { userId: "user-1", ...SAMPLE_INPUT, includeInLiquidFunds: true },
    });
  });

  it.each([
    ["DISPOSABLE", true],
    ["SAVINGS", true],
    ["RESTRICTED", false],
    ["CREDIT", false],
    ["DEBT", false],
  ] as const)("derives includeInLiquidFunds=%s -> %s for purpose %s", async (purpose, expected) => {
    const create = vi.fn().mockResolvedValue({ id: "acc-1" });
    const prisma = { account: { create } } as any;

    await createAccount(prisma, "user-1", { ...SAMPLE_INPUT, purpose });

    expect(create.mock.calls[0][0].data.includeInLiquidFunds).toBe(expected);
  });
});

describe("updateAccount", () => {
  it("updates only when the account belongs to the user, deriving includeInLiquidFunds when purpose changes", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const prisma = { account: { updateMany } } as any;

    const result = await updateAccount(prisma, "user-1", "acc-1", { name: "New Name", purpose: "RESTRICTED" });

    expect(result).toEqual({ ok: true });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "acc-1", userId: "user-1" },
      data: { name: "New Name", purpose: "RESTRICTED", includeInLiquidFunds: false },
    });
  });

  it("does not touch includeInLiquidFunds when purpose isn't part of the update", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const prisma = { account: { updateMany } } as any;

    await updateAccount(prisma, "user-1", "acc-1", { name: "New Name" });

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "acc-1", userId: "user-1" },
      data: { name: "New Name" },
    });
  });

  it("reports not found when no row matched (wrong user or missing account)", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 0 });
    const prisma = { account: { updateMany } } as any;

    const result = await updateAccount(prisma, "user-1", "acc-1", { name: "New Name" });

    expect(result).toEqual({ ok: false, error: "Account not found" });
  });
});

describe("archiveAccount", () => {
  it("sets archivedAt only for the owning user's account", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const prisma = { account: { updateMany } } as any;

    const result = await archiveAccount(prisma, "user-1", "acc-1");

    expect(result).toEqual({ ok: true });
    const args = updateMany.mock.calls[0][0];
    expect(args.where).toEqual({ id: "acc-1", userId: "user-1" });
    expect(args.data.archivedAt).toBeInstanceOf(Date);
  });
});

describe("listAccounts", () => {
  it("scopes to the user and excludes archived accounts by default", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = { account: { findMany } } as any;

    await listAccounts(prisma, "user-1");

    expect(findMany).toHaveBeenCalledWith({
      where: { userId: "user-1", archivedAt: null },
      orderBy: { createdAt: "asc" },
    });
  });

  it("includes archived accounts when asked", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = { account: { findMany } } as any;

    await listAccounts(prisma, "user-1", { includeArchived: true });

    expect(findMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      orderBy: { createdAt: "asc" },
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/accounts.test.ts`
Expected: FAIL — `purpose` doesn't exist on `AccountInput` yet, `includeInLiquidFunds` isn't derived.

- [ ] **Step 3: Implement**

```ts
import type { PrismaClient } from "@prisma/client";
import type { AccountPurpose } from "@/lib/constants/financial";

export type AccountInput = {
  name: string;
  accountType: string;
  openingBalance: number; // minor units
  currency: string;
  purpose: AccountPurpose;
  isPrimaryFundingAccount: boolean;
  color: string;
  icon: string;
};

export type AccountMutationResult = { ok: true } | { ok: false; error: string };

const LIQUID_PURPOSES: AccountPurpose[] = ["DISPOSABLE", "SAVINGS"];

function deriveIncludeInLiquidFunds(purpose: AccountPurpose): boolean {
  return LIQUID_PURPOSES.includes(purpose);
}

export async function createAccount(
  prisma: Pick<PrismaClient, "account">,
  userId: string,
  input: AccountInput,
) {
  return prisma.account.create({
    data: { userId, ...input, includeInLiquidFunds: deriveIncludeInLiquidFunds(input.purpose) },
  });
}

export async function updateAccount(
  prisma: Pick<PrismaClient, "account">,
  userId: string,
  accountId: string,
  input: Partial<AccountInput>,
): Promise<AccountMutationResult> {
  const data: Partial<AccountInput> & { includeInLiquidFunds?: boolean } = { ...input };
  if (input.purpose !== undefined) {
    data.includeInLiquidFunds = deriveIncludeInLiquidFunds(input.purpose);
  }
  const result = await prisma.account.updateMany({
    where: { id: accountId, userId },
    data,
  });
  if (result.count === 0) {
    return { ok: false, error: "Account not found" };
  }
  return { ok: true };
}

export async function archiveAccount(
  prisma: Pick<PrismaClient, "account">,
  userId: string,
  accountId: string,
): Promise<AccountMutationResult> {
  const result = await prisma.account.updateMany({
    where: { id: accountId, userId },
    data: { archivedAt: new Date() },
  });
  if (result.count === 0) {
    return { ok: false, error: "Account not found" };
  }
  return { ok: true };
}

export async function listAccounts(
  prisma: Pick<PrismaClient, "account">,
  userId: string,
  options: { includeArchived?: boolean } = {},
) {
  return prisma.account.findMany({
    where: {
      userId,
      ...(options.includeArchived ? {} : { archivedAt: null }),
    },
    orderBy: { createdAt: "asc" },
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/accounts.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck and lint**

Run: `npx tsc --noEmit && npx eslint src/lib/accounts.ts src/lib/accounts.test.ts`
Expected: errors expected at this point from other files not yet updated (Tasks 4-8) — only confirm no errors are newly introduced *within these two files themselves*; the project-wide typecheck happens in Task 9.

- [ ] **Step 6: Commit**

```bash
git add src/lib/accounts.ts src/lib/accounts.test.ts
git commit -m "feat(accounts): derive includeInLiquidFunds from purpose

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: `computeLiquidFunds` — filter by `purpose`

**Files:**
- Modify: `src/lib/liquid-funds.ts`
- Modify: `src/lib/liquid-funds.test.ts`

- [ ] **Step 1: Update the test's expected query**

```ts
    expect(prisma.account.findMany).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        archivedAt: null,
        purpose: { in: ["DISPOSABLE", "SAVINGS"] },
      },
    });
```

(replacing the old `includeInLiquidFunds`/`accountType` expectation — the rest of the test file is unchanged.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/liquid-funds.test.ts`
Expected: FAIL — the source still queries the old shape.

- [ ] **Step 3: Implement**

```ts
import type { PrismaClient } from "@prisma/client";
import { computeAccountBalance } from "@/lib/account-balance";

const LIQUID_PURPOSES = ["DISPOSABLE", "SAVINGS"];

export async function computeLiquidFunds(
  prisma: Pick<PrismaClient, "account" | "transaction">,
  userId: string,
): Promise<number> {
  const accounts = await prisma.account.findMany({
    where: {
      userId,
      archivedAt: null,
      purpose: { in: LIQUID_PURPOSES },
    },
  });

  const balances = await Promise.all(
    accounts.map((account: { id: string }) => computeAccountBalance(prisma, account.id)),
  );

  return balances.reduce((sum, balance) => sum + balance, 0);
}
```

(`EXCLUDED_FROM_LIQUID_FUNDS` is removed — `purpose` alone now determines eligibility, so the separate accountType exclusion list is redundant.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/liquid-funds.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/liquid-funds.ts src/lib/liquid-funds.test.ts
git commit -m "refactor(liquid-funds): filter by purpose instead of includeInLiquidFunds/accountType

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: `listRestrictedFundGroups` — filter by `purpose`

**Files:**
- Modify: `src/lib/restricted-funds.ts`
- Modify: `src/lib/restricted-funds.test.ts`

- [ ] **Step 1: Update the test's expected query**

```ts
    expect(prisma.account.findMany).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        archivedAt: null,
        purpose: "RESTRICTED",
      },
    });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/restricted-funds.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Remove the `import { EXCLUDED_FROM_LIQUID_FUNDS } from "@/lib/liquid-funds";` line and change the query:

```ts
  const accounts = await prisma.account.findMany({
    where: {
      userId,
      archivedAt: null,
      purpose: "RESTRICTED",
    },
  });
```

(everything else in this file — the dedup logic, `RestrictedFundGroup` shape — is unchanged.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/restricted-funds.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/restricted-funds.ts src/lib/restricted-funds.test.ts
git commit -m "refactor(restricted-funds): filter by purpose instead of includeInLiquidFunds/accountType

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: `getRecommendedFundingTransfer` — filter by `purpose`

**Files:**
- Modify: `src/lib/transfer-recommendations.ts`
- Modify: `src/lib/transfer-recommendations.test.ts`

- [ ] **Step 1: Add `purpose` to the test fixtures**

```ts
const FUNDING_ACCOUNT = {
  id: "checking",
  userId: "user-1",
  isPrimaryFundingAccount: true,
  archivedAt: null,
  includeInLiquidFunds: true,
  purpose: "DISPOSABLE",
  accountType: "CHECKING",
  openingBalance: 0,
};
const SAVINGS_ACCOUNT = {
  id: "savings",
  userId: "user-1",
  isPrimaryFundingAccount: false,
  archivedAt: null,
  includeInLiquidFunds: true,
  purpose: "SAVINGS",
  accountType: "SAVINGS",
  openingBalance: 0,
};
const CREDIT_CARD_ACCOUNT = {
  id: "cc",
  userId: "user-1",
  isPrimaryFundingAccount: false,
  archivedAt: null,
  includeInLiquidFunds: true,
  purpose: "CREDIT",
  accountType: "CREDIT_CARD",
  openingBalance: 0,
};
```

(the rest of the test file — every `it(...)` block — is unchanged; the mock's `findMany` returns these fixtures unconditionally regardless of query args, so the "credit card is excluded" assertion in "recommends transferring the shortfall..." depends on the *source's own* defensive filter, updated below.)

- [ ] **Step 2: Run the test to verify it still passes on the old code, then implement, to confirm the defensive filter is what's actually tested**

Run: `npx vitest run src/lib/transfer-recommendations.test.ts`
Expected: PASS still (fixtures gained a field the old code ignores) — this step is a sanity check, not a red/green step; proceed to Step 3 regardless.

- [ ] **Step 3: Implement**

```ts
import type { PrismaClient } from "@prisma/client";
import { computeAccountBalance } from "@/lib/account-balance";

export type FundingRecommendation = {
  fromAccountId: string;
  toAccountId: string;
  amount: number; // minor units, non-negative
};

const LIQUID_PURPOSES = ["DISPOSABLE", "SAVINGS"];

export async function getRecommendedFundingTransfer(
  prisma: Pick<PrismaClient, "account" | "transaction" | "payable">,
  userId: string,
  asOf: Date,
  options: { lookAheadDays?: number } = {},
): Promise<FundingRecommendation | null> {
  const lookAheadDays = options.lookAheadDays ?? 7;

  const fundingAccount = await prisma.account.findFirst({
    where: { userId, isPrimaryFundingAccount: true, archivedAt: null },
  });
  if (!fundingAccount) return null;

  const horizon = new Date(asOf.getFullYear(), asOf.getMonth(), asOf.getDate() + lookAheadDays);

  const upcomingPayables = await prisma.payable.findMany({
    where: {
      userId,
      status: "PENDING",
      accountId: fundingAccount.id,
      dueDate: { lte: horizon },
    },
  });
  const upcomingTotal = upcomingPayables.reduce(
    (sum: number, p: { amount: number }) => sum + p.amount,
    0,
  );

  const fundingBalance = await computeAccountBalance(prisma, fundingAccount.id);
  const shortfall = upcomingTotal - fundingBalance;
  if (shortfall <= 0) return null;

  const otherAccounts = await prisma.account.findMany({
    where: {
      userId,
      id: { not: fundingAccount.id },
      archivedAt: null,
      purpose: { in: LIQUID_PURPOSES },
    },
  });

  // Filtered again here (not just in the query's `where`) so this stays
  // correct even against a test double that doesn't implement Prisma's
  // filtering semantics — the DB-level filter above is the fast path.
  const eligibleAccounts = otherAccounts.filter(
    (account: { purpose: string }) => LIQUID_PURPOSES.includes(account.purpose),
  );

  const balances = await Promise.all(
    eligibleAccounts.map(async (account: { id: string }) => ({
      accountId: account.id,
      balance: await computeAccountBalance(prisma, account.id),
    })),
  );

  const bestSource = balances
    .filter((entry) => entry.balance > 0)
    .sort((a, b) => b.balance - a.balance)[0];

  if (!bestSource) return null;

  return {
    fromAccountId: bestSource.accountId,
    toAccountId: fundingAccount.id,
    amount: shortfall,
  };
}
```

(`EXCLUDED_FROM_SOURCE` is removed — `purpose` alone now determines eligibility.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/transfer-recommendations.test.ts`
Expected: PASS — specifically confirm "recommends transferring the shortfall from the highest-balance eligible account" still excludes the credit card.

- [ ] **Step 5: Commit**

```bash
git add src/lib/transfer-recommendations.ts src/lib/transfer-recommendations.test.ts
git commit -m "refactor(transfer-recommendations): filter by purpose instead of includeInLiquidFunds/accountType

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: Validation, server action, and account form

**Files:**
- Modify: `src/lib/validations/account.ts`
- Modify: `src/lib/validations/account.test.ts`
- Modify: `src/actions/account.actions.ts`
- Modify: `src/components/accounts/account-form-dialog.tsx`

- [ ] **Step 1: `src/lib/validations/account.ts`**

```ts
import { z } from "zod";
import { ACCOUNT_TYPES, ACCOUNT_PURPOSES } from "@/lib/constants/financial";

export const accountSchema = z.object({
  name: z.string().min(1, "Name is required"),
  accountType: z.enum(ACCOUNT_TYPES),
  openingBalance: z.number(), // major units — converted to minor units by the caller
  currency: z.string().min(1),
  purpose: z.enum(ACCOUNT_PURPOSES),
  isPrimaryFundingAccount: z.boolean(),
  color: z.string().min(1),
  icon: z.string().min(1),
});
```

- [ ] **Step 2: Update `src/lib/validations/account.test.ts`**

Replace `includeInLiquidFunds: true` with `purpose: "DISPOSABLE"` in every existing `safeParse` call, and add:

```ts
  it("rejects an invalid purpose", () => {
    const result = accountSchema.safeParse({
      name: "Checking",
      accountType: "CHECKING",
      openingBalance: 0,
      currency: "PHP",
      purpose: "NOT_A_PURPOSE",
      isPrimaryFundingAccount: false,
      color: "blue",
      icon: "landmark",
    });
    expect(result.success).toBe(false);
  });
```

- [ ] **Step 3: Run the test**

Run: `npx vitest run src/lib/validations/account.test.ts`
Expected: PASS.

- [ ] **Step 4: `src/actions/account.actions.ts`**

In `parseAccountForm`, replace:

```ts
    includeInLiquidFunds: formData.get("includeInLiquidFunds") === "true",
```

with:

```ts
    purpose: formData.get("purpose"),
```

- [ ] **Step 5: `src/components/accounts/account-form-dialog.tsx`**

Replace the `ExistingAccount` type's `includeInLiquidFunds: boolean` with `purpose: string`.

Replace the `defaultValues` blocks:

```ts
    defaultValues: existing
      ? {
          name: existing.name,
          accountType: existing.accountType as AccountFormValues["accountType"],
          openingBalance: toMajorUnits(existing.openingBalance, existing.currency),
          currency: existing.currency,
          purpose: existing.purpose as AccountFormValues["purpose"],
          isPrimaryFundingAccount: existing.isPrimaryFundingAccount,
          color: existing.color,
          icon: existing.icon,
        }
      : {
          name: "",
          accountType: "CHECKING",
          openingBalance: 0,
          currency: "PHP",
          purpose: "DISPOSABLE",
          isPrimaryFundingAccount: false,
          color: "blue",
          icon: "landmark",
        },
```

Add the import and a `watch("purpose")` alongside the existing `accountType` one:

```ts
import { ACCOUNT_TYPES, ACCOUNT_PURPOSES } from "@/lib/constants/financial";
```

```ts
  const accountType = watch("accountType");
  const purpose = watch("purpose");
```

Replace `formData.set("includeInLiquidFunds", String(values.includeInLiquidFunds));` with `formData.set("purpose", values.purpose);`.

Replace the restricted-fund checkbox:

```tsx
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={!watch("includeInLiquidFunds")}
              onChange={(e) => setValue("includeInLiquidFunds", !e.target.checked)}
            />
            Restricted fund (excluded from liquid funds and safe-to-spend)
          </label>
```

with a purpose selector:

```tsx
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="purpose">Purpose</Label>
            <Select value={purpose} onValueChange={(v) => setValue("purpose", v as AccountFormValues["purpose"])}>
              <SelectTrigger id="purpose">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACCOUNT_PURPOSES.map((p) => (
                  <SelectItem key={p} value={p}>
                    {PURPOSE_LABELS[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {purpose === "RESTRICTED"
                ? "Excluded from liquid funds and safe-to-spend — for a dedicated obligation."
                : purpose === "SAVINGS"
                  ? "Counted toward liquid funds, tracked separately as savings/reserves."
                  : purpose === "CREDIT" || purpose === "DEBT"
                    ? "Never counted as spendable funds."
                    : "Everyday spending — included in safe-to-spend."}
            </p>
          </div>
```

Add the label map near the top of the file, alongside the other module-level constants:

```ts
const PURPOSE_LABELS: Record<string, string> = {
  DISPOSABLE: "Disposable (everyday spending)",
  SAVINGS: "Savings / Reserve",
  RESTRICTED: "Restricted (dedicated obligation)",
  CREDIT: "Credit card",
  DEBT: "Loan / Debt",
};
```

- [ ] **Step 6: Typecheck and lint**

Run: `npx tsc --noEmit && npx eslint src/lib/validations/account.ts src/lib/validations/account.test.ts src/actions/account.actions.ts src/components/accounts/account-form-dialog.tsx`
Expected: no errors (some upstream errors from Task 8's not-yet-updated files are still expected until that task lands — this step confirms no *new* errors in these four files specifically).

- [ ] **Step 7: Commit**

```bash
git add src/lib/validations/account.ts src/lib/validations/account.test.ts src/actions/account.actions.ts src/components/accounts/account-form-dialog.tsx
git commit -m "feat(accounts): replace the restricted-fund checkbox with a purpose selector

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 8: Demo seed data

**Files:**
- Modify: `src/lib/demo-seed.ts`

- [ ] **Step 1: Give each seeded account a real purpose**

Replace `includeInLiquidFunds: true,` with `purpose: "DISPOSABLE",` on the "Everyday Checking" account, `includeInLiquidFunds: true,` with `purpose: "SAVINGS",` on "Rainy Day Savings" (this is fresh seed data, not a backfill — classifying it correctly as `SAVINGS` here costs nothing and better demonstrates the feature), and `includeInLiquidFunds: false,` with `purpose: "CREDIT",` on "Everyday Rewards Card".

- [ ] **Step 2: Run the demo-seed test**

Run: `npx vitest run src/lib/demo-seed.test.ts`
Expected: PASS (no assertions reference `includeInLiquidFunds`/`purpose` directly — this confirms the seed function still runs end-to-end).

- [ ] **Step 3: Commit**

```bash
git add src/lib/demo-seed.ts
git commit -m "feat(demo-seed): classify seeded accounts by purpose

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 9: Full verification and deploy

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass (a few more than before this phase — the new `it.each` cases in Task 3).

- [ ] **Step 2: Typecheck, lint, and build the whole project**

Run: `npx tsc --noEmit && npx eslint . && npx next build`
Expected: no errors, successful build. This is the point where any file this plan missed would surface as a type error — fix inline if so.

- [ ] **Step 3: Push to trigger a Vercel deploy**

```bash
git push
```

**Do not run `npm run db:push` or the backfill script from this environment** — there is no working `DATABASE_URL` locally. The deployed app's *code* will expect a `purpose` column to exist; until the schema is actually pushed to production, any query touching `Account.purpose` will fail at runtime against the live database.

- [ ] **Step 4: Report the required manual step to the user, then stop**

Tell the user explicitly, before doing anything else:

> "Phase 20.4 is code-complete and pushed, but **the database schema itself has not been updated** — I can't run `npm run db:push` from this environment (no working production `DATABASE_URL` locally). Please run these two commands yourself with the real production `DATABASE_URL` (e.g. after `vercel env pull` or via your Vercel dashboard), in this order:
> 1. `npm run db:push`
> 2. `npm run db:backfill-account-purpose`
>
> Until both run, the live app will error on anything touching accounts (the code now expects a `purpose` column that doesn't exist in production yet)."

- [ ] **Step 5: After the user confirms the migration + backfill ran, verify live**

- Log in as the demo account, open Accounts, edit "Everyday Rewards Card" — confirm its Purpose selector shows "Credit card" (backfilled correctly from `accountType`), and "Rainy Day Savings" shows whatever the demo re-seed set it to (if the demo account is re-seeded after this phase, it'll show "Savings / Reserve"; if not re-seeded, the backfill script would have left it as "Disposable" since its `includeInLiquidFunds` was `true`, and only re-seeding or a manual edit gives it the `SAVINGS` purpose — check whichever is actually true and don't assume).
- Confirm creating a new account with Purpose "Restricted" behaves exactly as the existing restricted-fund toggle did (excluded from Liquid funds, appears in the Dashboard's Restricted funds section).
- Confirm the Dashboard's Safe to spend / Liquid funds / Restricted funds figures are unchanged from before this phase for the demo account's current data (this phase is a refactor of *how* accounts are classified, not a behavior change for already-correctly-classified accounts).

- [ ] **Step 6: Report final results to the user**

Summarize: tests passing (count), build clean, and — once the user confirms the database migration ran — the live verification outcome. Note that Phase 20.5 (Accounts page regrouping into Disposable/Savings/Restricted/Credit & Debt sections) is next.
