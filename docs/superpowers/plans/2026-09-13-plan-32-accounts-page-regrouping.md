# Accounts Page Regrouping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Phase 20.5 (the final phase of `plan-20`) — group the existing Accounts page into Disposable / Savings & Reserves / Restricted / Credit & Debt sections, add a minimal `SavingsGoal` model with target/assigned tracking, and extend restricted funds with a "payments covered" count.

**Design reference:** `docs/superpowers/specs/2026-09-13-major-features-design.md` section B. **Depends on:** Phase 20.4 (`Account.purpose`, already shipped and verified live).

**Scope decisions (grounded in what already exists, not invented fresh):**
- **"Deposit and payment history" for Restricted, "recent activity" for Disposable** — reuse the **existing** Transactions page's `?accountId=` filter (`src/app/(app)/transactions/page.tsx` already supports it) via a plain link. No new ledger view is built — the exact same filtered list already exists and is one click away.
- **"Available balance" for Disposable** — this app has no held/pending-fund concept distinct from the ledger balance (`accountEffect` never discriminates by `Transaction.status`, and nothing in the codebase ever creates a `"PENDING"` transaction today). Inventing a new "available vs. current" split would be a real behavior change with balance-calculation ripple effects, well beyond "regrouping." This phase shows the one real balance plus a "pending activity" count (which will legitimately show zero for every account today, and that's correct, not a bug) — not a fabricated second number.
- **"Year Plan connection" for Savings** — Year Plan doesn't exist yet (Phase 22, not started). Omitted entirely rather than shown as a placeholder.
- **Safe-to-spend inclusion badge** — reflects *today's actual* `computeSafeToSpend` behavior (still liquid-funds-based, includes `SAVINGS` purpose) — not the Phase 21 dashboard revision, which hasn't shipped. A Savings account's badge reads "Included in Safe to spend" because that's still true right now.

---

### Task 1: `SavingsGoal` schema

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add the model and back-references**

```prisma
model SavingsGoal {
  id             String   @id @default(cuid())
  userId         String
  accountId      String   @unique
  targetAmount   Int?
  assignedAmount Int      @default(0)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  user    User    @relation(fields: [userId], references: [id])
  account Account @relation(fields: [accountId], references: [id])
}
```

Add `savingsGoals SavingsGoal[]` to `model User`, and `savingsGoal SavingsGoal?` to `model Account`.

- [ ] **Step 2: Regenerate the Prisma client**

Run: `npm run db:generate`
Expected: succeeds (this only reads `schema.prisma`, no database connection needed).

- [ ] **Step 3: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(savings): add the SavingsGoal model

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

(Per Phase 20.4's discovery: this project's Vercel deploy applies schema changes automatically on build — no separate manual `db:push` step is needed this time. Task 7's live verification will confirm the table exists after deploy.)

---

### Task 2: `savings-goals.ts` domain functions

**Files:**
- Create: `src/lib/savings-goals.ts`
- Create: `src/lib/savings-goals.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it, vi } from "vitest";
import { getSavingsGoal, upsertSavingsGoal, computeSavingsProgress } from "@/lib/savings-goals";

function makeFakePrisma(overrides: Record<string, any> = {}) {
  return {
    account: { findFirst: vi.fn().mockResolvedValue({ id: "acc-1", userId: "user-1" }) },
    savingsGoal: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue({ id: "goal-1" }),
    },
    ...overrides,
  } as any;
}

describe("getSavingsGoal", () => {
  it("looks up the goal by accountId, scoped through the account's own userId", async () => {
    const prisma = makeFakePrisma({
      savingsGoal: { findUnique: vi.fn().mockResolvedValue({ id: "goal-1", accountId: "acc-1" }) },
    });
    const result = await getSavingsGoal(prisma, "user-1", "acc-1");
    expect(result).toEqual({ id: "goal-1", accountId: "acc-1" });
  });

  it("returns null when the account doesn't belong to the user", async () => {
    const prisma = makeFakePrisma({ account: { findFirst: vi.fn().mockResolvedValue(null) } });
    const result = await getSavingsGoal(prisma, "user-1", "acc-1");
    expect(result).toBeNull();
  });
});

describe("upsertSavingsGoal", () => {
  it("creates or updates the goal only when the account belongs to the user", async () => {
    const prisma = makeFakePrisma();
    const result = await upsertSavingsGoal(prisma, "user-1", "acc-1", { targetAmount: 500000, assignedAmount: 100000 });

    expect(result).toEqual({ ok: true });
    expect(prisma.savingsGoal.upsert).toHaveBeenCalledWith({
      where: { accountId: "acc-1" },
      create: { userId: "user-1", accountId: "acc-1", targetAmount: 500000, assignedAmount: 100000 },
      update: { targetAmount: 500000, assignedAmount: 100000 },
    });
  });

  it("refuses when the account doesn't belong to the user", async () => {
    const prisma = makeFakePrisma({ account: { findFirst: vi.fn().mockResolvedValue(null) } });
    const result = await upsertSavingsGoal(prisma, "user-1", "acc-1", { targetAmount: null, assignedAmount: 0 });
    expect(result).toEqual({ ok: false, error: "Account not found" });
  });
});

describe("computeSavingsProgress", () => {
  it("computes unassigned, remaining target, and progress percentage", () => {
    const result = computeSavingsProgress({ targetAmount: 500000, assignedAmount: 200000 }, 350000);
    expect(result).toEqual({ unassignedAmount: 150000, remainingTarget: 300000, progressPct: 40 });
  });

  it("returns null remainingTarget/progressPct when there is no target set", () => {
    const result = computeSavingsProgress({ targetAmount: null, assignedAmount: 200000 }, 350000);
    expect(result).toEqual({ unassignedAmount: 150000, remainingTarget: null, progressPct: null });
  });

  it("clamps remainingTarget at zero once the goal is fully assigned", () => {
    const result = computeSavingsProgress({ targetAmount: 100000, assignedAmount: 150000 }, 150000);
    expect(result.remainingTarget).toBe(0);
    expect(result.progressPct).toBe(100);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/savings-goals.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
import type { PrismaClient } from "@prisma/client";

export type SavingsGoalMutationResult = { ok: true } | { ok: false; error: string };

type SavingsGoalsPrisma = Pick<PrismaClient, "account" | "savingsGoal">;

export async function getSavingsGoal(prisma: SavingsGoalsPrisma, userId: string, accountId: string) {
  const account = await prisma.account.findFirst({ where: { id: accountId, userId } });
  if (!account) return null;
  return prisma.savingsGoal.findUnique({ where: { accountId } });
}

export async function upsertSavingsGoal(
  prisma: SavingsGoalsPrisma,
  userId: string,
  accountId: string,
  input: { targetAmount: number | null; assignedAmount: number },
): Promise<SavingsGoalMutationResult> {
  const account = await prisma.account.findFirst({ where: { id: accountId, userId } });
  if (!account) return { ok: false, error: "Account not found" };

  await prisma.savingsGoal.upsert({
    where: { accountId },
    create: { userId, accountId, ...input },
    update: input,
  });
  return { ok: true };
}

export function computeSavingsProgress(
  goal: { targetAmount: number | null; assignedAmount: number },
  balance: number,
): { unassignedAmount: number; remainingTarget: number | null; progressPct: number | null } {
  const unassignedAmount = balance - goal.assignedAmount;
  if (goal.targetAmount === null) {
    return { unassignedAmount, remainingTarget: null, progressPct: null };
  }
  const remainingTarget = Math.max(0, goal.targetAmount - goal.assignedAmount);
  const progressPct = Math.min(100, Math.round((goal.assignedAmount / goal.targetAmount) * 100));
  return { unassignedAmount, remainingTarget, progressPct };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/savings-goals.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Typecheck and lint**

Run: `npx tsc --noEmit && npx eslint src/lib/savings-goals.ts src/lib/savings-goals.test.ts`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/savings-goals.ts src/lib/savings-goals.test.ts
git commit -m "feat(savings): add SavingsGoal domain functions

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: `paymentsCovered` on `RestrictedFundGroup`

**Files:**
- Modify: `src/lib/restricted-funds.ts`
- Modify: `src/lib/restricted-funds.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/restricted-funds.test.ts`:

```ts
  it("counts how many kept payables the current balance can fully cover, in due-date order", async () => {
    const prisma = makeFakePrisma({
      accounts: [{ id: "acc-1", name: "Emergency Fund", openingBalance: 50000 }],
      payablesByAccount: {
        "acc-1": [
          { id: "p1", name: "Insurance", amount: 20000, dueDate: new Date(2026, 9, 1), recurringPayableId: null },
          { id: "p2", name: "Property tax", amount: 15000, dueDate: new Date(2026, 8, 20), recurringPayableId: null },
          { id: "p3", name: "Big bill", amount: 30000, dueDate: new Date(2026, 9, 10), recurringPayableId: null },
        ],
      },
    });
    const [group] = await listRestrictedFundGroups(prisma, "user-1");
    // due-date order: p2 (15000), p1 (20000), p3 (30000) — balance 50000 covers p2+p1 (35000) but not +p3 (65000)
    expect(group.paymentsCovered).toBe(2);
  });

  it("reports zero payments covered when the balance can't fully cover even the nearest one", async () => {
    const prisma = makeFakePrisma({
      accounts: [{ id: "acc-1", name: "Emergency Fund", openingBalance: 5000 }],
      payablesByAccount: {
        "acc-1": [
          { id: "p1", name: "Insurance", amount: 20000, dueDate: new Date(2026, 9, 1), recurringPayableId: null },
        ],
      },
    });
    const [group] = await listRestrictedFundGroups(prisma, "user-1");
    expect(group.paymentsCovered).toBe(0);
  });
```

Also update the existing "reports zero obligation and a null nextPayable" test's expected object to include `paymentsCovered: 0`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/restricted-funds.test.ts`
Expected: FAIL — `paymentsCovered` is `undefined`.

- [ ] **Step 3: Implement**

Add to `RestrictedFundGroup`:

```ts
export type RestrictedFundGroup = {
  accountId: string;
  accountName: string;
  balance: number;
  obligationTotal: number;
  nextPayable: { name: string; amount: number; dueDate: Date } | null;
  projectedBalance: number;
  paymentsCovered: number;
};
```

Add a helper and wire it in:

```ts
function countPaymentsCovered(kept: { amount: number }[], balance: number): number {
  let remaining = balance;
  let count = 0;
  for (const p of kept) {
    if (remaining < p.amount) break;
    remaining -= p.amount;
    count++;
  }
  return count;
}
```

In the `accounts.map(...)` body, after computing `kept`:

```ts
      const paymentsCovered = countPaymentsCovered(kept, balance);

      return {
        accountId: account.id,
        accountName: account.name,
        balance,
        obligationTotal,
        nextPayable,
        projectedBalance: balance - obligationTotal,
        paymentsCovered,
      };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/restricted-funds.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Typecheck and lint**

Run: `npx tsc --noEmit && npx eslint src/lib/restricted-funds.ts src/lib/restricted-funds.test.ts`
Expected: no errors (the Dashboard page that already consumes `RestrictedFundGroup` is unaffected — it destructures only the fields it uses, adding one is additive).

- [ ] **Step 6: Commit**

```bash
git add src/lib/restricted-funds.ts src/lib/restricted-funds.test.ts
git commit -m "feat(restricted-funds): add paymentsCovered

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Validation + server action for savings goals

**Files:**
- Create: `src/lib/validations/savings-goal.ts`
- Create: `src/actions/savings-goal.actions.ts`

- [ ] **Step 1: `src/lib/validations/savings-goal.ts`**

```ts
import { z } from "zod";

export const savingsGoalSchema = z.object({
  targetAmount: z.number().nullable(), // major units, null = no target set; converted by the caller
  assignedAmount: z.number(), // major units
});
```

- [ ] **Step 2: `src/actions/savings-goal.actions.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { savingsGoalSchema } from "@/lib/validations/savings-goal";
import { upsertSavingsGoal } from "@/lib/savings-goals";
import { toMinorUnits } from "@/lib/money";

export type SavingsGoalActionResult = { ok: true } | { ok: false; error: string };

export async function upsertSavingsGoalAction(
  accountId: string,
  currency: string,
  formData: FormData,
): Promise<SavingsGoalActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const rawTarget = formData.get("targetAmount");
  const parsed = savingsGoalSchema.safeParse({
    targetAmount: rawTarget === "" || rawTarget === null ? null : Number(rawTarget),
    assignedAmount: Number(formData.get("assignedAmount")),
  });
  if (!parsed.success) return { ok: false, error: "Please check the goal details" };

  const result = await upsertSavingsGoal(prisma, session.user.id, accountId, {
    targetAmount: parsed.data.targetAmount === null ? null : toMinorUnits(parsed.data.targetAmount, currency),
    assignedAmount: toMinorUnits(parsed.data.assignedAmount, currency),
  });

  if (result.ok) revalidatePath("/accounts");
  return result;
}
```

- [ ] **Step 3: Typecheck and lint**

Run: `npx tsc --noEmit && npx eslint src/lib/validations/savings-goal.ts src/actions/savings-goal.actions.ts`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/validations/savings-goal.ts src/actions/savings-goal.actions.ts
git commit -m "feat(savings): add the savings-goal server action

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: `SavingsGoalFormDialog` component

**Files:**
- Create: `src/components/accounts/savings-goal-form-dialog.tsx`

No test — presentational, matches every other form dialog in this codebase.

- [ ] **Step 1: Write the component**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { upsertSavingsGoalAction } from "@/actions/savings-goal.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toMajorUnits } from "@/lib/money";

type FormValues = { targetAmount: string; assignedAmount: number };

export function SavingsGoalFormDialog({
  accountId,
  currency,
  existing,
}: {
  accountId: string;
  currency: string;
  existing: { targetAmount: number | null; assignedAmount: number } | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<FormValues>({
    defaultValues: {
      targetAmount: existing?.targetAmount != null ? String(toMajorUnits(existing.targetAmount, currency)) : "",
      assignedAmount: existing ? toMajorUnits(existing.assignedAmount, currency) : 0,
    },
  });

  async function onSubmit(values: FormValues) {
    const formData = new FormData();
    formData.set("targetAmount", values.targetAmount);
    formData.set("assignedAmount", String(values.assignedAmount));
    const result = await upsertSavingsGoalAction(accountId, currency, formData);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Goal updated");
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="sm" />}>
        {existing ? "Edit goal" : "Set goal"}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Savings goal</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="targetAmount">Target amount (leave blank for no target)</Label>
            <Input id="targetAmount" type="number" step="0.01" {...register("targetAmount")} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="assignedAmount">Amount assigned to this goal</Label>
            <Input
              id="assignedAmount"
              type="number"
              step="0.01"
              {...register("assignedAmount", { valueAsNumber: true })}
            />
            <p className="text-xs text-muted-foreground">
              The rest of this account's balance counts as unassigned savings.
            </p>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit && npx eslint src/components/accounts/savings-goal-form-dialog.tsx`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/accounts/savings-goal-form-dialog.tsx
git commit -m "feat(savings): add the SavingsGoalFormDialog component

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: Accounts page — regroup into four sections

**Files:**
- Modify: `src/app/(app)/accounts/page.tsx`
- Modify: `src/components/accounts/account-list.tsx`

- [ ] **Step 1: `accounts/page.tsx` — fetch everything the sections need**

```tsx
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { listAccounts } from "@/lib/accounts";
import { computeAccountBalance } from "@/lib/account-balance";
import { listRestrictedFundGroups } from "@/lib/restricted-funds";
import { AccountFormDialog } from "@/components/accounts/account-form-dialog";
import { AccountList } from "@/components/accounts/account-list";

export default async function AccountsPage() {
  const session = await auth();
  const userId = session!.user.id;

  const [accounts, restrictedFunds, savingsGoals] = await Promise.all([
    listAccounts(prisma, userId),
    listRestrictedFundGroups(prisma, userId),
    prisma.savingsGoal.findMany({ where: { userId } }),
  ]);

  const withBalances = await Promise.all(
    accounts.map(async (account) => {
      const pendingTransactions = await prisma.transaction.findMany({
        where: { userId, accountId: account.id, status: "PENDING" },
      });
      return {
        ...account,
        balance: await computeAccountBalance(prisma, account.id),
        pendingCount: pendingTransactions.length,
        pendingTotal: pendingTransactions.reduce((sum, t) => sum + Math.abs(t.amount), 0),
      };
    }),
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Accounts</h1>
        <AccountFormDialog />
      </div>
      <AccountList accounts={withBalances} restrictedFunds={restrictedFunds} savingsGoals={savingsGoals} />
    </div>
  );
}
```

- [ ] **Step 2: Rewrite `account-list.tsx` to group by purpose**

```tsx
import Link from "next/link";
import { formatMoney } from "@/lib/money";
import { AccountFormDialog } from "@/components/accounts/account-form-dialog";
import { ReconcileDialog } from "@/components/accounts/reconcile-dialog";
import { SavingsGoalFormDialog } from "@/components/accounts/savings-goal-form-dialog";
import { archiveAccountAction } from "@/actions/account.actions";
import { computeSavingsProgress } from "@/lib/savings-goals";
import type { RestrictedFundGroup } from "@/lib/restricted-funds";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type AccountRow = {
  id: string;
  name: string;
  accountType: string;
  openingBalance: number;
  currency: string;
  includeInLiquidFunds: boolean;
  purpose: string;
  isPrimaryFundingAccount: boolean;
  color: string;
  icon: string;
  balance: number;
  pendingCount: number;
  pendingTotal: number;
};

type SavingsGoalRow = { accountId: string; targetAmount: number | null; assignedAmount: number };

function ArchiveForm({ accountId }: { accountId: string }) {
  return (
    <form
      action={async () => {
        "use server";
        await archiveAccountAction(accountId);
      }}
    >
      <Button type="submit" variant="ghost">
        Archive
      </Button>
    </form>
  );
}

function AccountRowActions({ account }: { account: AccountRow }) {
  return (
    <div className="flex gap-2">
      <AccountFormDialog existing={account} />
      <ReconcileDialog accountId={account.id} currency={account.currency} />
      <ArchiveForm accountId={account.id} />
    </div>
  );
}

export function AccountList({
  accounts,
  restrictedFunds,
  savingsGoals,
}: {
  accounts: AccountRow[];
  restrictedFunds: RestrictedFundGroup[];
  savingsGoals: SavingsGoalRow[];
}) {
  if (accounts.length === 0) {
    return (
      <p className="text-muted-foreground">
        No accounts yet. Add one to start tracking balances.
      </p>
    );
  }

  const disposable = accounts.filter((a) => a.purpose === "DISPOSABLE");
  const savings = accounts.filter((a) => a.purpose === "SAVINGS");
  const restricted = accounts.filter((a) => a.purpose === "RESTRICTED");
  const creditDebt = accounts.filter((a) => a.purpose === "CREDIT" || a.purpose === "DEBT");

  const restrictedByAccountId = new Map(restrictedFunds.map((g) => [g.accountId, g]));
  const goalByAccountId = new Map(savingsGoals.map((g) => [g.accountId, g]));

  return (
    <div className="flex flex-col gap-8">
      {disposable.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">Disposable</h2>
          <div className="flex flex-col gap-3">
            {disposable.map((account) => (
              <Card key={account.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium">
                    {account.name}
                    {account.isPrimaryFundingAccount && (
                      <span className="ml-2 text-xs text-muted-foreground">(primary funding)</span>
                    )}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {account.accountType} · {formatMoney(account.balance, account.currency)} · Included in Safe to
                    spend
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {account.pendingCount > 0
                      ? `${account.pendingCount} pending transaction(s) totaling ${formatMoney(account.pendingTotal, account.currency)}`
                      : "No pending activity"}
                    {" · "}
                    <Link href={`/transactions?accountId=${account.id}`} className="underline">
                      Recent activity
                    </Link>
                  </p>
                </div>
                <AccountRowActions account={account} />
              </Card>
            ))}
          </div>
        </section>
      )}

      {savings.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">Savings & Reserves</h2>
          <div className="flex flex-col gap-3">
            {savings.map((account) => {
              const goal = goalByAccountId.get(account.id) ?? null;
              const progress = goal ? computeSavingsProgress(goal, account.balance) : null;
              return (
                <Card key={account.id} className="flex flex-col gap-2 p-4">
                  <div className="flex items-center justify-between">
                    <p className="font-medium">{account.name}</p>
                    <p className="font-medium">{formatMoney(account.balance, account.currency)}</p>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {account.accountType} · Included in Safe to spend
                  </p>
                  {goal && goal.targetAmount !== null ? (
                    <p className="text-sm text-muted-foreground">
                      Target {formatMoney(goal.targetAmount, account.currency)} · Assigned{" "}
                      {formatMoney(goal.assignedAmount, account.currency)} · Remaining{" "}
                      {formatMoney(progress!.remainingTarget!, account.currency)} · Unassigned{" "}
                      {formatMoney(progress!.unassignedAmount, account.currency)} ({progress!.progressPct}%)
                    </p>
                  ) : goal ? (
                    <p className="text-sm text-muted-foreground">
                      No target set · Assigned {formatMoney(goal.assignedAmount, account.currency)} · Unassigned{" "}
                      {formatMoney(progress!.unassignedAmount, account.currency)}
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground">No goal set yet.</p>
                  )}
                  <div className="flex gap-2">
                    <SavingsGoalFormDialog
                      accountId={account.id}
                      currency={account.currency}
                      existing={goal ? { targetAmount: goal.targetAmount, assignedAmount: goal.assignedAmount } : null}
                    />
                    <AccountRowActions account={account} />
                  </div>
                </Card>
              );
            })}
          </div>
        </section>
      )}

      {restricted.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">Restricted</h2>
          <div className="flex flex-col gap-3">
            {restricted.map((account) => {
              const group = restrictedByAccountId.get(account.id);
              return (
                <Card key={account.id} className="flex flex-col gap-2 p-4">
                  <div className="flex items-center justify-between">
                    <p className="font-medium">{account.name}</p>
                    <p className="font-medium">{formatMoney(account.balance, account.currency)}</p>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {account.accountType} · Excluded from liquid funds and Safe to spend
                  </p>
                  {group && (
                    <p className="text-sm text-muted-foreground">
                      {group.obligationTotal > 0
                        ? `Obligation: ${formatMoney(group.obligationTotal, account.currency)}${
                            group.nextPayable
                              ? ` · Next: ${group.nextPayable.name} — ${formatMoney(group.nextPayable.amount, account.currency)} due ${group.nextPayable.dueDate.toLocaleDateString()}`
                              : ""
                          } · Covers ${group.paymentsCovered} payment(s)`
                        : "No upcoming obligations"}
                    </p>
                  )}
                  {group && (
                    <p className="text-sm text-muted-foreground">
                      Projected after payment: {formatMoney(group.projectedBalance, account.currency)}
                    </p>
                  )}
                  <div className="flex items-center gap-2">
                    <Link href={`/transactions?accountId=${account.id}`} className="text-sm underline">
                      Deposit & payment history
                    </Link>
                    <AccountRowActions account={account} />
                  </div>
                </Card>
              );
            })}
          </div>
        </section>
      )}

      {creditDebt.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">Credit & Debt</h2>
          <div className="flex flex-col gap-3">
            {creditDebt.map((account) => (
              <Card key={account.id} className="flex items-center justify-between p-4">
                <div>
                  <p className="font-medium">{account.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {account.accountType} · {formatMoney(account.balance, account.currency)} · Never counted as
                    spendable funds
                  </p>
                </div>
                <AccountRowActions account={account} />
              </Card>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Typecheck and lint**

Run: `npx tsc --noEmit && npx eslint "src/app/(app)/accounts/page.tsx" src/components/accounts/account-list.tsx`
Expected: no errors.

- [ ] **Step 4: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass unchanged (this task is presentational + a page query change with no dedicated test file, consistent with this codebase's convention).

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/accounts/page.tsx" src/components/accounts/account-list.tsx
git commit -m "feat(accounts): regroup the Accounts page into Disposable/Savings/Restricted/Credit & Debt

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: Full verification and deploy

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass (a handful more than before — Tasks 2 and 3's new tests).

- [ ] **Step 2: Typecheck, lint, and build the whole project**

Run: `npx tsc --noEmit && npx eslint . && npx next build`
Expected: no errors, successful build.

- [ ] **Step 3: Push to trigger a Vercel deploy**

```bash
git push
```

- [ ] **Step 4: Manually verify on the live deployment**

- Open Accounts: confirm four labeled sections appear (only the ones with at least one account — the demo data has no Debt accounts, so that combined section shows only the credit card, or splits naturally if a loan is added later).
- In Savings & Reserves, click "Set goal" on Rainy Day Savings, set a target and an assigned amount, save, and confirm the card now shows target/assigned/remaining/unassigned and a percentage.
- In Restricted (if the demo account has one set from a prior session, or set one temporarily via Edit → Purpose → Restricted to test, then set it back afterward), confirm "Covers N payment(s)" appears and the "Deposit & payment history" link opens Transactions pre-filtered to that account.
- In Disposable, confirm "No pending activity" shows (expected — nothing in this app creates a `PENDING` transaction today) and "Recent activity" links to the filtered Transactions page.
- In Credit & Debt, confirm the credit card shows with no Safe-to-spend/liquid-funds claims.
- Confirm the Dashboard's Restricted funds section and Safe-to-spend/Liquid-funds figures are unaffected by this phase (no regression).

- [ ] **Step 5: Report final results to the user**

Summarize: tests passing (count), build clean, live verification outcomes. Note that this completes the entire visual-design-and-account-grouping initiative (`plan-20`, Phases 20.1–20.5) — the next area from the original mega-request's eight plans is the Dashboard balance overview revision (`plan-21`), Year Plan (`plan-22`), Shopping (`plan-23`), or another area, per the user's choice.
