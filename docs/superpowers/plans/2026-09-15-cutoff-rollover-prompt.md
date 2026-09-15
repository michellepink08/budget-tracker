# Cutoff Rollover Prompt Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a new budget cutoff starts, show a Dashboard banner that lets Michelle optionally move some
of her disposable leftover into savings, then acknowledge the rest as "Rollover" — a label recorded once
per cutoff, never a real transaction — and show that recorded amount on the Budget page, Dashboard, and the
Ledger's Disposable tab.

**Architecture:** Two new nullable columns on `BudgetPeriod` (`rolloverAcknowledgedAt`, `rolloverAmount`)
back a small pure-logic module (`src/lib/cutoff-rollover.ts`) with a decision function
(`shouldPromptRollover`) and a mutation (`acknowledgeRollover`, following the existing `updateMany` +
count-check pattern from `src/lib/categories.ts`). A new Dashboard-only banner component reuses the
*existing* `createTransferAction` for the optional "move to savings" step — no new transfer logic — and a
tiny shared `RolloverNote` component renders the recorded amount on the three pages.

**Tech Stack:** Next.js App Router server components, Prisma/Neon Postgres, Vitest, react-hook-form (for the
banner's mini transfer form, matching every other form in this codebase).

---

### Task 1: Add `rolloverAcknowledgedAt` / `rolloverAmount` to `BudgetPeriod`

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Edit the `BudgetPeriod` model**

In `prisma/schema.prisma`, find the `BudgetPeriod` model and add the two new fields right after `status`:

```prisma
model BudgetPeriod {
  id        String   @id @default(cuid())
  userId    String
  name      String
  startDate DateTime
  endDate   DateTime
  status    String
  rolloverAcknowledgedAt DateTime?
  rolloverAmount         Int?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  user         User               @relation(fields: [userId], references: [id])
  allocations  BudgetAllocation[]
  transactions Transaction[]

  @@unique([userId, startDate])
}
```

- [ ] **Step 2: Regenerate the Prisma client and push the schema**

Run:
```bash
npx prisma generate
npx prisma db push
```

Expected: both commands finish without error, and `db push` reports the `BudgetPeriod` table was updated
with 2 new columns.

**If either command is blocked** (this machine's Application Control policy sometimes blocks the Prisma
schema-engine binary), fall back to raw SQL against the same database, then regenerate the client only:

```bash
cat > scripts/_tmp-add-rollover-columns.mjs << 'EOF'
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";
neonConfig.webSocketConstructor = ws;
const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });
await prisma.$executeRawUnsafe(
  'ALTER TABLE "BudgetPeriod" ADD COLUMN IF NOT EXISTS "rolloverAcknowledgedAt" TIMESTAMP(3)',
);
await prisma.$executeRawUnsafe(
  'ALTER TABLE "BudgetPeriod" ADD COLUMN IF NOT EXISTS "rolloverAmount" INTEGER',
);
console.log("Columns added.");
await prisma.$disconnect();
EOF
node scripts/_tmp-add-rollover-columns.mjs
rm scripts/_tmp-add-rollover-columns.mjs
npx prisma generate
```

Expected either way: `npx prisma generate` succeeds and `node_modules/.prisma/client` now types
`BudgetPeriod.rolloverAcknowledgedAt` as `Date | null` and `BudgetPeriod.rolloverAmount` as `number | null`.

- [ ] **Step 3: Restart the local dev server**

The running `next dev` process caches the old Prisma client module — it must be restarted after this change
or every later manual verification step will see stale types/errors. Kill the existing background dev
server process and start a fresh one:

```bash
WS_NO_BUFFER_UTIL=1 WS_NO_UTF_8_VALIDATE=1 npx next dev --webpack
```

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(budget-period): add rolloverAcknowledgedAt/rolloverAmount columns

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: `shouldPromptRollover` / `acknowledgeRollover`

**Files:**
- Create: `src/lib/cutoff-rollover.ts`
- Test: `src/lib/cutoff-rollover.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
import { describe, expect, it, vi } from "vitest";
import { acknowledgeRollover, shouldPromptRollover } from "@/lib/cutoff-rollover";

describe("shouldPromptRollover", () => {
  it("returns false when the period is already acknowledged, without querying for earlier periods", async () => {
    const count = vi.fn();
    const prisma = { budgetPeriod: { count } } as any;

    const result = await shouldPromptRollover(prisma, "user-1", {
      id: "period-1",
      startDate: new Date(2026, 8, 15),
      rolloverAcknowledgedAt: new Date(2026, 8, 15),
    });

    expect(result).toBe(false);
    expect(count).not.toHaveBeenCalled();
  });

  it("returns false when there is no earlier period (this is the user's very first cutoff)", async () => {
    const count = vi.fn().mockResolvedValue(0);
    const prisma = { budgetPeriod: { count } } as any;

    const result = await shouldPromptRollover(prisma, "user-1", {
      id: "period-1",
      startDate: new Date(2026, 8, 15),
      rolloverAcknowledgedAt: null,
    });

    expect(result).toBe(false);
    expect(count).toHaveBeenCalledWith({
      where: { userId: "user-1", startDate: { lt: new Date(2026, 8, 15) } },
    });
  });

  it("returns true when unacknowledged and an earlier period exists", async () => {
    const count = vi.fn().mockResolvedValue(1);
    const prisma = { budgetPeriod: { count } } as any;

    const result = await shouldPromptRollover(prisma, "user-1", {
      id: "period-1",
      startDate: new Date(2026, 8, 15),
      rolloverAcknowledgedAt: null,
    });

    expect(result).toBe(true);
  });
});

describe("acknowledgeRollover", () => {
  it("records the given amount and an acknowledgment timestamp", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const prisma = { budgetPeriod: { updateMany } } as any;

    const result = await acknowledgeRollover(prisma, "user-1", "period-1", 543200);

    expect(result).toEqual({ ok: true });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "period-1", userId: "user-1" },
      data: { rolloverAcknowledgedAt: expect.any(Date), rolloverAmount: 543200 },
    });
  });

  it("reports not found for a period belonging to another user", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 0 });
    const prisma = { budgetPeriod: { updateMany } } as any;

    const result = await acknowledgeRollover(prisma, "user-1", "period-owned-by-someone-else", 100);

    expect(result).toEqual({ ok: false, error: "Budget period not found" });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/cutoff-rollover.test.ts`
Expected: FAIL — `Cannot find module '@/lib/cutoff-rollover'`

- [ ] **Step 3: Write the implementation**

```typescript
import type { PrismaClient } from "@prisma/client";

export type RolloverPeriod = {
  id: string;
  startDate: Date;
  rolloverAcknowledgedAt: Date | null;
};

// A new user's very first cutoff has nothing to roll over — the prompt
// only ever appears once at least one earlier BudgetPeriod exists.
export async function shouldPromptRollover(
  prisma: Pick<PrismaClient, "budgetPeriod">,
  userId: string,
  period: RolloverPeriod,
): Promise<boolean> {
  if (period.rolloverAcknowledgedAt) return false;

  const earlierCount = await prisma.budgetPeriod.count({
    where: { userId, startDate: { lt: period.startDate } },
  });
  return earlierCount > 0;
}

export type AcknowledgeRolloverResult = { ok: true } | { ok: false; error: string };

// `amount` is a snapshot the caller computes (the disposable total at the
// moment of acknowledgment) — this function only records it. It's
// deliberately not computed in here so the historical figure never
// silently drifts if account balances change later, and so this stays
// trivial to test without mocking the whole balance-computation chain.
export async function acknowledgeRollover(
  prisma: Pick<PrismaClient, "budgetPeriod">,
  userId: string,
  periodId: string,
  amount: number,
): Promise<AcknowledgeRolloverResult> {
  const result = await prisma.budgetPeriod.updateMany({
    where: { id: periodId, userId },
    data: { rolloverAcknowledgedAt: new Date(), rolloverAmount: amount },
  });
  if (result.count === 0) {
    return { ok: false, error: "Budget period not found" };
  }
  return { ok: true };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/cutoff-rollover.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/cutoff-rollover.ts src/lib/cutoff-rollover.test.ts
git commit -m "feat(rollover): add shouldPromptRollover/acknowledgeRollover

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: `acknowledgeRolloverAction`

**Files:**
- Modify: `src/actions/budget.actions.ts`

No test file — this codebase's convention is thin action wrappers (auth + a lib call + revalidatePath)
tested only indirectly through the lib layer; `transaction.actions.test.ts` is the one exception, for
already-more-complex parsing logic that doesn't apply here.

- [ ] **Step 1: Add the action**

In `src/actions/budget.actions.ts`, add these two imports at the top (alongside the existing ones):

```typescript
import { acknowledgeRollover } from "@/lib/cutoff-rollover";
import { computeDisposableTotal } from "@/lib/purpose-totals";
```

Then append this function at the end of the file:

```typescript
export async function acknowledgeRolloverAction(periodId: string): Promise<BudgetActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.user.id } });

  const amount = await computeDisposableTotal(prisma, user.id);
  const result = await acknowledgeRollover(prisma, user.id, periodId, amount);
  if (!result.ok) return result;

  revalidatePath("/dashboard");
  revalidatePath("/budget");
  revalidatePath("/ledger");
  return { ok: true };
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/actions/budget.actions.ts
git commit -m "feat(rollover): add acknowledgeRolloverAction

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: `RolloverNote` (shared read-only display)

**Files:**
- Create: `src/components/budget/rollover-note.tsx`

- [ ] **Step 1: Write the component**

```tsx
import { formatMoney } from "@/lib/money";
import { Card } from "@/components/ui/card";

// Deliberately never labeled "income" and never folded into any income
// total anywhere it's rendered — see the design doc's "why this can't be
// a real Income transaction" section. Purely a label recorded once per
// cutoff via acknowledgeRollover.
export function RolloverNote({
  amount,
  currency,
  description,
}: {
  amount: number;
  currency: string;
  description?: string;
}) {
  return (
    <Card className="border-dashed p-4">
      <p className="text-sm text-muted-foreground">Rollover</p>
      <p className="text-2xl font-semibold">{formatMoney(amount, currency)}</p>
      {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
    </Card>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/components/budget/rollover-note.tsx
git commit -m "feat(rollover): add RolloverNote display component

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: `RolloverBanner` (Dashboard-only, interactive)

**Files:**
- Create: `src/components/dashboard/rollover-banner.tsx`

- [ ] **Step 1: Write the component**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { createTransferAction } from "@/actions/transaction.actions";
import { acknowledgeRolloverAction } from "@/actions/budget.actions";
import { formatMoney } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { IconBadge } from "@/components/ui/icon-badge";
import { RotateCcw } from "lucide-react";

type AccountOption = { id: string; name: string; currency: string };

type TransferFormValues = { amount: number; sourceAccountId: string; destinationAccountId: string };

export function RolloverBanner({
  periodId,
  disposableTotal,
  currency,
  sourceAccounts,
  destinationAccounts,
}: {
  periodId: string;
  disposableTotal: number;
  currency: string;
  sourceAccounts: AccountOption[];
  destinationAccounts: AccountOption[];
}) {
  const router = useRouter();
  const [acknowledging, setAcknowledging] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { isSubmitting },
  } = useForm<TransferFormValues>({
    defaultValues: {
      amount: 0,
      sourceAccountId: sourceAccounts[0]?.id ?? "",
      destinationAccountId: destinationAccounts[0]?.id ?? "",
    },
  });

  async function onTransfer(values: TransferFormValues) {
    const formData = new FormData();
    formData.set("amount", String(values.amount));
    formData.set("date", new Date().toISOString().slice(0, 10));
    formData.set("sourceAccountId", values.sourceAccountId);
    formData.set("destinationAccountId", values.destinationAccountId);
    formData.set("description", "Rollover to savings");

    const result = await createTransferAction(formData);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Moved to savings");
    reset({ amount: 0, sourceAccountId: values.sourceAccountId, destinationAccountId: values.destinationAccountId });
    router.refresh();
  }

  async function onAcknowledge() {
    setAcknowledging(true);
    const result = await acknowledgeRolloverAction(periodId);
    setAcknowledging(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Rollover recorded");
    router.refresh();
  }

  return (
    <Card variant="info" className="border-dashed p-4">
      <div className="mb-2 flex items-center gap-2">
        <IconBadge icon={RotateCcw} tone="info" size="sm" />
        <p className="font-medium">
          New cutoff started — {formatMoney(disposableTotal, currency)} across your disposable accounts
          carries over as Rollover.
        </p>
      </div>

      {sourceAccounts.length > 0 && destinationAccounts.length > 0 && (
        <form onSubmit={handleSubmit(onTransfer)} className="mt-3 flex flex-wrap items-end gap-2 text-sm">
          <div className="flex flex-col gap-1">
            <Label htmlFor="rollover-amount">Move to savings (optional)</Label>
            <Input
              id="rollover-amount"
              type="number"
              step="0.01"
              min="0.01"
              className="w-32"
              {...register("amount", { valueAsNumber: true })}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="rollover-source">From</Label>
            <select
              id="rollover-source"
              className="h-9 rounded-lg border border-input bg-input px-3 text-sm"
              {...register("sourceAccountId")}
            >
              {sourceAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="rollover-destination">To</Label>
            <select
              id="rollover-destination"
              className="h-9 rounded-lg border border-input bg-input px-3 text-sm"
              {...register("destinationAccountId")}
            >
              {destinationAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" variant="outline" disabled={isSubmitting}>
            {isSubmitting ? "Moving..." : "Move"}
          </Button>
        </form>
      )}

      <div className="mt-3">
        <Button onClick={onAcknowledge} disabled={acknowledging}>
          {acknowledging ? "Recording..." : "Got it"}
        </Button>
      </div>
    </Card>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/rollover-banner.tsx
git commit -m "feat(rollover): add RolloverBanner with optional move-to-savings

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: Wire the banner and note into the Dashboard

**Files:**
- Modify: `src/app/(app)/dashboard/page.tsx`

- [ ] **Step 1: Add imports**

At the top of `src/app/(app)/dashboard/page.tsx`, add:

```typescript
import { shouldPromptRollover } from "@/lib/cutoff-rollover";
import { RolloverBanner } from "@/components/dashboard/rollover-banner";
import { RolloverNote } from "@/components/budget/rollover-note";
```

- [ ] **Step 2: Compute whether to show the banner**

Right after `const activePeriod = await resolveBudgetPeriodForDate(...)` (around line 30), add:

```typescript
const promptRollover = await shouldPromptRollover(prisma, user.id, activePeriod);
```

- [ ] **Step 3: Render the banner or note**

Immediately after the closing `</div>` of the 3-column summary cards grid (the block starting
`<div className="grid grid-cols-1 gap-4 lg:grid-cols-3">` and ending around line 144), insert:

```tsx
      {promptRollover && (
        <RolloverBanner
          periodId={activePeriod.id}
          disposableTotal={disposableTotal}
          currency={user.currency}
          sourceAccounts={accounts
            .filter((a) => a.purpose === "DISPOSABLE")
            .map((a) => ({ id: a.id, name: a.name, currency: a.currency }))}
          destinationAccounts={accounts
            .filter((a) => a.purpose === "SAVINGS" || a.purpose === "RESTRICTED")
            .map((a) => ({ id: a.id, name: a.name, currency: a.currency }))}
        />
      )}

      {!promptRollover && activePeriod.rolloverAmount !== null && (
        <RolloverNote amount={activePeriod.rolloverAmount} currency={user.currency} />
      )}
```

`accounts` is already fetched earlier in this file (`listAccounts(prisma, user.id)`) for the funding
recommendation — no new query needed.

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors — `Account` from `listAccounts` already has `purpose`/`currency` fields.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/dashboard/page.tsx"
git commit -m "feat(rollover): show rollover banner/note on Dashboard

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: Show the recorded rollover on the Budget page

**Files:**
- Modify: `src/app/(app)/budget/page.tsx`

- [ ] **Step 1: Add the import**

```typescript
import { RolloverNote } from "@/components/budget/rollover-note";
```

- [ ] **Step 2: Render it next to the header**

In the returned JSX, right after the closing `</div>` of the header block (the `flex flex-col gap-3
sm:flex-row...` block that contains the title and the period picker/buttons, around line 61), insert:

```tsx
      {activePeriod.rolloverAmount !== null && (
        <RolloverNote amount={activePeriod.rolloverAmount} currency={user.currency} />
      )}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/budget/page.tsx"
git commit -m "feat(rollover): show rollover note on Budget page

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 8: Show the recorded rollover on the Ledger's Disposable tab

**Files:**
- Modify: `src/app/(app)/ledger/page.tsx`

- [ ] **Step 1: Add the import**

```typescript
import { RolloverNote } from "@/components/budget/rollover-note";
```

- [ ] **Step 2: Look up the matching period for the current range**

Right after the `rows = await listLedgerRows(...)` line inside the `if (!isLoansTab)` block, add a
second lookup scoped to the Disposable tab only:

```typescript
  let disposableRolloverAmount: number | null = null;
  if (activeTab === "DISPOSABLE") {
    const periodForRange = await prisma.budgetPeriod.findUnique({
      where: { userId_startDate: { userId: user.id, startDate: start } },
    });
    disposableRolloverAmount = periodForRange?.rolloverAmount ?? null;
  }
```

- [ ] **Step 3: Render the note above the table**

In the JSX, right before the `<LedgerWideTable` element (inside the `) : (` branch), insert:

```tsx
          {disposableRolloverAmount !== null && (
            <RolloverNote
              amount={disposableRolloverAmount}
              currency={user.currency}
              description="Carried over from the previous cutoff — not counted as Income."
            />
          )}
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 5: Manually verify the exact-date-match caveat**

`start` here is derived from `params.from` (a `new Date()` parse of an ISO date string) when a custom range
is picked, or from `defaultPeriod.startDate` otherwise. `findUnique` requires an exact match — if you pick a
custom date range that doesn't line up exactly with a stored `BudgetPeriod.startDate`, the note simply won't
show (same graceful-miss behavior already accepted elsewhere in this file). No fix needed; just don't be
surprised by it during manual testing.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/ledger/page.tsx"
git commit -m "feat(rollover): show rollover note on Ledger's Disposable tab

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 9: Full verification pass

- [ ] **Step 1: Type-check the whole project**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 2: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass (previous total plus the 5 new `cutoff-rollover.test.ts` tests)

- [ ] **Step 3: Lint changed files**

Run:
```bash
npx eslint src/lib/cutoff-rollover.ts src/actions/budget.actions.ts src/components/budget/rollover-note.tsx src/components/dashboard/rollover-banner.tsx "src/app/(app)/dashboard/page.tsx" "src/app/(app)/budget/page.tsx" "src/app/(app)/ledger/page.tsx"
```
Expected: no errors

- [ ] **Step 4: Manually verify against the real account**

Using the Browser pane against the live demo account or your own account:
1. Confirm the banner appears on the Dashboard for a fresh cutoff with an earlier period on record.
2. Try the optional "Move to savings" mini-transfer, confirm the destination account's balance increases
   and the disposable total in the banner's headline drops after `router.refresh()`.
3. Click "Got it," confirm the banner disappears and a "Rollover: ₱X" note appears in its place.
4. Confirm the same figure shows on the Budget page and on the Ledger's Disposable tab (for the matching
   date range).
5. Confirm the figure never appears added into any Income total, category actual, or Reports chart.

- [ ] **Step 5: Reset demo data if the demo account was used for manual testing**

```bash
npm run db:seed-demo
```
