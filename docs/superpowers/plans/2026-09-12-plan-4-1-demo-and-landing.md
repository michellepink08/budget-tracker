# Plan 4.1: Demo & Landing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The first half of Plan 4 (Portfolio presentation) — fix the root cause of the demo-data cycle mismatch flagged back in Plan 3B.3, make the demo account's data resettable from inside the running app (not just via a local CLI script), and replace the current unconditional `/` → `/login` redirect with a real public landing page and a one-click demo entry.

**What this plan found, and why it's needed:** `scripts/seed-demo-data.mjs` creates the demo user's `BudgetPeriod` as a hardcoded plain calendar month (1st to end of month), but the demo user's actual `cycleStartDay` is 25 (set during onboarding) — so every seeded transaction lands in a period that doesn't match what the app itself resolves as "the current cycle" today. That's exactly the mismatch Plan 3B.3 noticed on the Dashboard/Budget/Reports pages. Separately, the same script only deletes rows from the five tables that existed when it was written (`Transaction`, `BudgetPeriod`, `Subcategory`, `Category`, `Account`) — re-running it today, after Plans 3A/3B added `RecurringRule`, `Payable`, `RecurringPayable`, `Loan`, `CreditCard`, `InstallmentPurchase`/`InstallmentPayment`, and `BudgetAllocation`, would now fail with a foreign-key error if any of those rows exist for the demo user.

**Architecture:**
- **The in-app reset** (`src/lib/demo-seed.ts`'s `seedDemoData`) is built entirely from the domain functions this app already has — `createAccount`, `createCategory`, `createExpenseLikeTransaction`, `createTransferTransaction` — so every transaction's budget period is resolved through the real `resolveBudgetPeriodForDate`/`cycleStartDay` machinery automatically. This isn't a parallel implementation prone to drifting out of sync with the real cycle logic; it's the same logic, just orchestrated as a demo-data recipe instead of user-driven CRUD.
- **The CLI script** (`scripts/seed-demo-data.mjs`) can't import that TypeScript module directly — it's a plain `node` script with no build step, run standalone without the Next.js app (this machine's Application Control policy is also why this project avoids adding new native-binary-shipping tools like `tsx`/`esbuild` casually — see the existing Prisma/Turbopack workarounds). It keeps its own small, explicitly-flagged, self-contained cycle-boundary calculation (mirroring `src/lib/cycle.ts`'s algorithm for the single case "the cycle containing today") — the same kind of deliberate, documented duplication already accepted in this project for `prisma/schema.sql` mirroring `prisma/schema.prisma`.
- **Demo entry** reuses the existing Credentials auth setup exactly as-is — a server action calls `signIn("credentials", {...})` with the demo account's own published credentials (already documented throughout this project), the same way `signOutAction` already calls `signOut()` server-side. No new auth mechanism, no ephemeral-account machinery.
- **The landing page** replaces `/`'s unconditional redirect with a conditional one: signed-in visitors still redirect straight to `/dashboard` (unchanged); signed-out visitors see the new marketing page instead of bouncing straight to `/login`.

**Tech Stack:** No new dependencies (deliberately — see the CLI-script note above).

**Read first:** `scripts/seed-demo-data.mjs` (the dataset this plan translates into domain-function calls, and the bug this plan fixes); `src/lib/transactions.ts` (`createExpenseLikeTransaction`/`createTransferTransaction`, reused unchanged — every one of their budget-period-resolution guarantees is exactly what fixes the mismatch); `src/lib/cycle.ts` (`getCycleForDate` — the algorithm the CLI script's small duplicated helper must match); `src/app/page.tsx` (current unconditional redirect); `src/app/(auth)/login/page.tsx` and `src/components/nav/sign-out-button.tsx`/`src/actions/auth.actions.ts` (the existing auth patterns this plan's demo-entry action follows).

**Scope boundary — explicitly NOT in this plan:** README/architecture docs, screenshots, accessibility/responsive/performance review, deployment prep (Plan 4.2); an ephemeral per-visitor demo account (every "View Demo" click logs into the same shared demo account, same as manually typing its published credentials would); changing the demo dataset's actual content beyond what's needed to fix the cycle bug — same accounts, categories, and transactions as today, just correctly period-resolved.

---

### Task 1: Fix the CLI seed script's cycle-period bug and missing table deletes

**Files:**
- Modify: `scripts/seed-demo-data.mjs`

- [ ] **Step 1: Add the missing deletes, in FK-safe child-to-parent order**

Replace:

```javascript
// Clear this user's existing financial rows (children first).
await prisma.transaction.deleteMany({ where: { userId: user.id } });
await prisma.budgetPeriod.deleteMany({ where: { userId: user.id } });
await prisma.subcategory.deleteMany({ where: { userId: user.id } });
await prisma.category.deleteMany({ where: { userId: user.id } });
await prisma.account.deleteMany({ where: { userId: user.id } });
```

with:

```javascript
// Clear this user's existing financial rows, children first. Every table
// added since this script was first written (Plans 3A/3B) needs a delete
// here too, or re-running this script fails on a foreign-key constraint
// the moment any of those rows exist.
await prisma.installmentPayment.deleteMany({ where: { userId: user.id } });
await prisma.installmentPurchase.deleteMany({ where: { userId: user.id } });
await prisma.payable.deleteMany({ where: { userId: user.id } });
await prisma.recurringPayable.deleteMany({ where: { userId: user.id } });
await prisma.recurringRule.deleteMany({ where: { userId: user.id } });
await prisma.creditCard.deleteMany({ where: { userId: user.id } });
await prisma.loan.deleteMany({ where: { userId: user.id } });
await prisma.budgetAllocation.deleteMany({ where: { userId: user.id } });
await prisma.transaction.deleteMany({ where: { userId: user.id } });
await prisma.budgetPeriod.deleteMany({ where: { userId: user.id } });
await prisma.subcategory.deleteMany({ where: { userId: user.id } });
await prisma.category.deleteMany({ where: { userId: user.id } });
await prisma.account.deleteMany({ where: { userId: user.id } });
```

- [ ] **Step 2: Replace the hardcoded calendar-month period with the user's real cycle**

Replace:

```javascript
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
```

with:

```javascript
// This CLI script runs standalone via plain `node`, with no build step,
// so it can't import src/lib/cycle.ts directly — it keeps this small,
// self-contained mirror of getCycleForDate's algorithm instead, scoped to
// just the one case this script needs ("the cycle containing today").
// Keep this in sync with src/lib/cycle.ts by hand if that logic changes —
// the same deliberate-duplication tradeoff already accepted for
// prisma/schema.sql mirroring prisma/schema.prisma.
function daysInMonth(year, monthIndex0) {
  return new Date(year, monthIndex0 + 1, 0).getDate();
}

function cycleContainingToday(cycleStartDay) {
  const today = new Date();
  const year = today.getFullYear();
  const monthIndex0 = today.getMonth();
  const day = today.getDate();
  const effectiveStartDay = Math.min(cycleStartDay, daysInMonth(year, monthIndex0));

  let startYear = year;
  let startMonth = monthIndex0;
  if (day < effectiveStartDay) {
    startMonth -= 1;
    if (startMonth < 0) {
      startMonth = 11;
      startYear -= 1;
    }
  }
  const clampedStartDay = Math.min(cycleStartDay, daysInMonth(startYear, startMonth));
  const start = new Date(startYear, startMonth, clampedStartDay);

  let endMonth = startMonth + 1;
  let endYear = startYear;
  if (endMonth > 11) {
    endMonth = 0;
    endYear += 1;
  }
  const clampedEndDay = Math.min(cycleStartDay, daysInMonth(endYear, endMonth));
  const end = new Date(endYear, endMonth, clampedEndDay - 1);

  return { start, end };
}

const { start, end } = cycleContainingToday(user.cycleStartDay);
const budgetPeriod = await prisma.budgetPeriod.create({
  data: {
    userId: user.id,
    name: `${start.toLocaleDateString()} – ${end.toLocaleDateString()}`,
    startDate: start,
    endDate: end,
    status: "ACTIVE",
  },
});
```

- [ ] **Step 3: Run the script and confirm the period now matches the app's own resolution**

```bash
npm run db:seed-demo
```

Expected: `Seeded fictional demo data for demo@example.com.` with no errors.

Then, with the dev server running and logged in as the demo account, check the Budget page's default period matches this script's newly-created one (same start/end dates) — not a separate "Aug 25 – Sep 24" period the app resolves independently. If a *second*, app-created period still exists from before this fix (e.g. from earlier verification passes), that's pre-existing stale data, not a new bug — this script's own period is what to check against.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "fix: align demo seed script's budget period with the user's real cycleStartDay"
```

---

### Task 2: Domain — `src/lib/demo-seed.ts`

**Files:**
- Create: `src/lib/demo-seed.ts`
- Test: `src/lib/demo-seed.test.ts`

- [ ] **Step 1: Write the failing test**

This one test exercises the whole recipe against a mocked Prisma client and checks the parts that matter: every delete is scoped to the given user, the accounts/categories get created, and every transaction is created through the cycle-aware domain functions (not a manually-constructed `BudgetPeriod`) — the actual period-correctness guarantee is already covered by `createExpenseLikeTransaction`'s/`createTransferTransaction`'s own tests from Plans 2A/3A.2, so this test doesn't re-prove that, just that this function calls them instead of bypassing them.

```typescript
// src/lib/demo-seed.test.ts
import { describe, expect, it, vi } from "vitest";
import { seedDemoData } from "@/lib/demo-seed";

function makeFakePrisma() {
  const deleteManyMock = vi.fn().mockResolvedValue({ count: 0 });
  return {
    installmentPayment: { deleteMany: deleteManyMock },
    installmentPurchase: { deleteMany: deleteManyMock },
    payable: { deleteMany: deleteManyMock },
    recurringPayable: { deleteMany: deleteManyMock },
    recurringRule: { deleteMany: deleteManyMock },
    creditCard: { deleteMany: deleteManyMock },
    loan: { deleteMany: deleteManyMock },
    budgetAllocation: { deleteMany: deleteManyMock },
    transaction: {
      deleteMany: deleteManyMock,
      create: vi.fn().mockResolvedValue({ id: "txn-new" }),
    },
    budgetPeriod: {
      deleteMany: deleteManyMock,
      findUnique: vi.fn().mockResolvedValue({ id: "period-1" }),
      create: vi.fn(),
    },
    subcategory: { deleteMany: deleteManyMock },
    category: {
      deleteMany: deleteManyMock,
      create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: `cat-${data.name}`, ...data })),
    },
    account: {
      deleteMany: deleteManyMock,
      create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: `acc-${data.name}`, ...data })),
    },
  } as any;
}

describe("seedDemoData", () => {
  it("clears every table scoped to the given user before recreating anything", async () => {
    const prisma = makeFakePrisma();

    await seedDemoData(prisma, "user-1", 25);

    for (const model of [
      "installmentPayment",
      "installmentPurchase",
      "payable",
      "recurringPayable",
      "recurringRule",
      "creditCard",
      "loan",
      "budgetAllocation",
      "transaction",
      "budgetPeriod",
      "subcategory",
      "category",
      "account",
    ] as const) {
      expect((prisma as any)[model].deleteMany).toHaveBeenCalledWith({ where: { userId: "user-1" } });
    }
  });

  it("creates the three demo accounts and six demo categories", async () => {
    const prisma = makeFakePrisma();

    await seedDemoData(prisma, "user-1", 25);

    expect(prisma.account.create).toHaveBeenCalledTimes(3);
    expect(prisma.category.create).toHaveBeenCalledTimes(6);
  });

  it("creates every transaction through the transaction table (via the cycle-aware domain functions)", async () => {
    const prisma = makeFakePrisma();

    await seedDemoData(prisma, "user-1", 25);

    // 6 plain transactions (salary, rent, groceries, dining, refund, card
    // payment) + 2 linked transfer rows = 8.
    expect(prisma.transaction.create).toHaveBeenCalledTimes(8);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/lib/demo-seed.test.ts
```

Expected: FAIL — `src/lib/demo-seed.ts` does not exist yet.

- [ ] **Step 3: Implement**

```typescript
// src/lib/demo-seed.ts
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
    includeInLiquidFunds: true,
    isPrimaryFundingAccount: true,
    color: "blue",
    icon: "landmark",
  });

  const savings = await createAccount(prisma, userId, {
    name: "Rainy Day Savings",
    accountType: "SAVINGS",
    openingBalance: 12000000, // ₱120,000.00
    currency: "PHP",
    includeInLiquidFunds: true,
    isPrimaryFundingAccount: false,
    color: "green",
    icon: "piggy-bank",
  });

  await createAccount(prisma, userId, {
    name: "Everyday Rewards Card",
    accountType: "CREDIT_CARD",
    openingBalance: -850000, // owes ₱8,500.00
    currency: "PHP",
    includeInLiquidFunds: false,
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
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/lib/demo-seed.test.ts
```

Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add in-app demo-data seeding built from real domain functions"
```

---

### Task 3: Centralize `DEMO_EMAIL` and add the reset server action

**Files:**
- Modify: `src/lib/config.ts`
- Create: `src/actions/demo.actions.ts`

- [ ] **Step 1: Add `DEMO_EMAIL` to the shared config**

```typescript
// src/lib/config.ts
// Single place to rename the product later — nothing else should
// hardcode the app name.
export const APP_NAME = "Budget Tracker";

// The one seeded account demo-mode features (the public "View Demo"
// button, the in-app "Reset demo data" action) are allowed to touch.
// Never used to gate anything security-sensitive beyond "is this the
// shared demo account" — it's not a secret, it's published throughout
// this project's own docs.
export const DEMO_EMAIL = "demo@example.com";
```

- [ ] **Step 2: Implement the server action**

```typescript
// src/actions/demo.actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { DEMO_EMAIL } from "@/lib/config";
import { seedDemoData } from "@/lib/demo-seed";

export type DemoActionResult = { ok: true } | { ok: false; error: string };

export async function resetDemoDataAction(): Promise<DemoActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.user.id } });
  if (user.email !== DEMO_EMAIL) {
    return { ok: false, error: "Only the demo account can be reset" };
  }

  await seedDemoData(prisma, user.id, user.cycleStartDay);

  revalidatePath("/", "layout");
  return { ok: true };
}
```

- [ ] **Step 3: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add resetDemoDataAction, guarded to the demo account"
```

---

### Task 4: "Reset demo data" in Settings

**Files:**
- Create: `src/components/settings/demo-data-settings.tsx`
- Modify: `src/app/(app)/settings/page.tsx`

- [ ] **Step 1: Implement the client component**

```typescript
// src/components/settings/demo-data-settings.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { resetDemoDataAction } from "@/actions/demo.actions";
import { Button } from "@/components/ui/button";

export function DemoDataSettings() {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);

  async function handleReset() {
    setIsPending(true);
    const result = await resetDemoDataAction();
    setIsPending(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Demo data reset");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-muted-foreground">
        This is the shared public demo account. Resetting restores its original fictional accounts,
        categories, and transactions — any changes made while exploring are discarded.
      </p>
      <Button variant="outline" className="w-fit" onClick={handleReset} disabled={isPending}>
        {isPending ? "Resetting..." : "Reset demo data"}
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Add the section to Settings, shown only for the demo account**

In `src/app/(app)/settings/page.tsx`, add the import:

```typescript
import { DEMO_EMAIL } from "@/lib/config";
import { DemoDataSettings } from "@/components/settings/demo-data-settings";
```

and append a conditional section after the existing Recurring section, right before the closing `</div>`:

```typescript
      {user.email === DEMO_EMAIL && (
        <div>
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">Demo data</h2>
          <DemoDataSettings />
        </div>
      )}
```

- [ ] **Step 3: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add Reset demo data section to Settings, visible only to the demo account"
```

---

### Task 5: Public landing page and one-click demo entry

**Files:**
- Modify: `src/app/page.tsx`, `src/actions/auth.actions.ts`
- Create: `src/components/landing/view-demo-button.tsx`

- [ ] **Step 1: Add the demo sign-in server action**

In `src/actions/auth.actions.ts`, add:

```typescript
import { DEMO_EMAIL } from "@/lib/config";

const DEMO_PASSWORD = "demopassword123"; // the seeded demo account's own password, published throughout this project

export async function viewDemoAction(): Promise<void> {
  await signIn("credentials", {
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
    redirectTo: "/dashboard",
  });
}
```

(This goes alongside the existing `signOutAction` in that file — both call into `@/auth`'s exported `signIn`/`signOut` server-side, the same pattern.)

- [ ] **Step 2: Implement the "View Demo" button**

```typescript
// src/components/landing/view-demo-button.tsx
import { viewDemoAction } from "@/actions/auth.actions";
import { Button } from "@/components/ui/button";

export function ViewDemoButton() {
  return (
    <form action={viewDemoAction}>
      <Button type="submit" size="lg">
        View Demo
      </Button>
    </form>
  );
}
```

- [ ] **Step 3: Replace the root page's unconditional redirect with a real landing page**

```typescript
// src/app/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { APP_NAME } from "@/lib/config";
import { ViewDemoButton } from "@/components/landing/view-demo-button";
import { buttonVariants } from "@/components/ui/button";

const DIFFERENTIATORS = [
  {
    title: "Budget cycles that match payday, not the calendar",
    body: "Set your own cutoff day — the 25th, the 10th, whatever your pay cycle actually is — and every report follows it.",
  },
  {
    title: "Real account tracking",
    body: "Cash, checking, e-wallets, credit cards, and loans, each with their own running balance.",
  },
  {
    title: "Transfers that don't lie about your spending",
    body: "Moving money between your own accounts is never counted as income or an expense — only a transfer fee is.",
  },
  {
    title: "Bills and installments, planned ahead",
    body: "See what's due this week across one-off bills, recurring bills, and credit-card installment plans in one place.",
  },
  {
    title: "Budget rollover, per category",
    body: "Unused or overspent amounts can carry into the next cycle — you choose which categories do that, and how.",
  },
  {
    title: "Reconciliation that never silently overwrites",
    body: "Tell the app what an account actually holds; it shows you the gap and asks before recording an adjustment.",
  },
];

export default async function Home() {
  const session = await auth();
  if (session) {
    redirect("/dashboard");
  }

  return (
    <div className="flex flex-col gap-16 px-4 py-16">
      <section className="mx-auto flex max-w-2xl flex-col items-center gap-6 text-center">
        <h1 className="text-4xl font-semibold">{APP_NAME}</h1>
        <p className="text-lg text-muted-foreground">
          A budget tracker built around how you actually get paid — not the calendar month.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <ViewDemoButton />
          <Link href="/signup" className={buttonVariants({ variant: "outline", size: "lg" })}>
            Sign up
          </Link>
          <Link href="/login" className={buttonVariants({ variant: "ghost", size: "lg" })}>
            Log in
          </Link>
        </div>
      </section>

      <section className="mx-auto grid max-w-4xl grid-cols-1 gap-6 sm:grid-cols-2">
        {DIFFERENTIATORS.map((item) => (
          <div key={item.title} className="rounded-lg border p-5">
            <h2 className="font-medium">{item.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{item.body}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
```

(`Button` itself doesn't support an `asChild`/`render`-style child-element pattern — this project's Base UI setup only gives that to components like `DialogTrigger`. `buttonVariants` is the exported `cva` function `Button` itself is built from, so styling a plain `<Link>` with it directly, as above, is the established way to get a button-styled link without wrapping.)

- [ ] **Step 4: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add public landing page and one-click demo entry"
```

---

### Task 6: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

```bash
npm test
```

Expected: all tests pass (existing 205 plus this plan's new tests — 3 for `seedDemoData` — 208 total).

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Browser walkthrough**

Start the dev server (fresh restart recommended, given this session's history of stale-webpack-cache artifacts after structural changes) and verify, without being logged in:

- Visiting `/` shows the new landing page, not an immediate redirect to `/login`.
- Click "View Demo" — confirm it logs straight into the demo account and lands on `/dashboard`.
- Click "Sign up" and "Log in" from the landing page — confirm both still reach their real pages.
- Log in as the demo account normally, go to Settings, confirm a "Demo data" section appears with a "Reset demo data" button (log in as a *non*-demo account, e.g. sign up a throwaway one, and confirm that section does *not* appear there).
- Click "Reset demo data" — confirm the toast, and confirm the Dashboard/Budget page immediately reflect the freshly reseeded data with **no** cycle mismatch this time: the Budget page's default period should now be the one this run's `seedDemoData` created, and the seeded transactions (salary, rent, groceries, dining, refund, card payment, transfer) should show real `actual` amounts against it — check this directly by comparing the Budget page's category actuals against what the Reports page's "Spending by category" chart shows for the same period; they should agree, unlike the mismatch Plan 3B.3 found.
- Confirm signing in as the demo account and visiting `/` while already signed in still redirects to `/dashboard` (the landing page is only for signed-out visitors).
- Delete the throwaway non-demo test account created for the "section shouldn't appear" check.

- [ ] **Step 4: Confirm a clean working tree**

```bash
git status --short
```

Expected: no output (everything already committed; verification found no code changes needed, or any fix was committed above).
