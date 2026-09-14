# Demo Mode: Auto-Reset and Limits Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the shared public demo account automatically fresh on every visit and safe to leave open to strangers — nobody can lock it out of its own settings, permanently delete its seeded data, or grow its shared dataset without bound.

**Architecture:** Two small guard functions (`assertNotDemo`, `assertUnderDemoCap`) in a new `src/lib/demo-guard.ts`, called at the top of every create/archive/delete/settings server action — matching this codebase's existing inline-guard convention (e.g. `assertOwnedAccount`). A new `demoResetAt` field on `User` drives a lazy auto-reset check inside the existing `viewDemoAction()`. A small banner component shown only for the demo account.

**Tech Stack:** Next.js Server Actions, Prisma (Postgres/Neon), Vitest, TypeScript.

---

### Task 1: Add `demoResetAt` to the `User` model

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add the field**

In `prisma/schema.prisma`, inside `model User { ... }`, add a new nullable field right after `onboardedAt`:

```prisma
  onboardedAt   DateTime?
  demoResetAt   DateTime? // when the shared demo account was last auto/manually reset; unused for every other user
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors (schema changes take effect for the Prisma Client types via the project's existing Vercel-build-step `prisma db push`/generate flow — this repo's Windows dev machine can't run `prisma generate` locally per its Application Control policy, so this step just confirms nothing *already generated* broke; the real generated-client check happens in Task 22's full build).

- [ ] **Step 3: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(demo): add demoResetAt field to track the shared demo account's last reset"
```

---

### Task 2: `src/lib/demo-guard.ts` — the two guard functions (TDD)

**Files:**
- Create: `src/lib/demo-guard.ts`
- Test: `src/lib/demo-guard.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/demo-guard.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { assertNotDemo, assertUnderDemoCap } from "@/lib/demo-guard";
import { DEMO_EMAIL } from "@/lib/config";

describe("assertNotDemo", () => {
  it("blocks the demo account", async () => {
    const prisma = { user: { findUnique: vi.fn().mockResolvedValue({ email: DEMO_EMAIL }) } } as any;
    const result = await assertNotDemo(prisma, "demo-user-id");
    expect(result).toEqual({
      ok: false,
      error: "Not available in the shared demo — sign up for your own account to do this.",
    });
  });

  it("allows a real account", async () => {
    const prisma = { user: { findUnique: vi.fn().mockResolvedValue({ email: "real.user@example.com" }) } } as any;
    const result = await assertNotDemo(prisma, "real-user-id");
    expect(result).toBeNull();
  });

  it("allows when the user row can't be found (fail open — a missing user is caught elsewhere)", async () => {
    const prisma = { user: { findUnique: vi.fn().mockResolvedValue(null) } } as any;
    const result = await assertNotDemo(prisma, "missing-user-id");
    expect(result).toBeNull();
  });
});

describe("assertUnderDemoCap", () => {
  it("blocks the demo account once it's at the cap", async () => {
    const prisma = { user: { findUnique: vi.fn().mockResolvedValue({ email: DEMO_EMAIL }) } } as any;
    const countCurrent = vi.fn().mockResolvedValue(100);
    const result = await assertUnderDemoCap(prisma, "demo-user-id", countCurrent, 100);
    expect(result).toEqual({ ok: false, error: "Demo limit reached (100 max) — sign up to add more." });
  });

  it("allows the demo account one under the cap", async () => {
    const prisma = { user: { findUnique: vi.fn().mockResolvedValue({ email: DEMO_EMAIL }) } } as any;
    const countCurrent = vi.fn().mockResolvedValue(99);
    const result = await assertUnderDemoCap(prisma, "demo-user-id", countCurrent, 100);
    expect(result).toBeNull();
  });

  it("never even calls countCurrent for a real account", async () => {
    const prisma = { user: { findUnique: vi.fn().mockResolvedValue({ email: "real.user@example.com" }) } } as any;
    const countCurrent = vi.fn().mockResolvedValue(9999);
    const result = await assertUnderDemoCap(prisma, "real-user-id", countCurrent, 100);
    expect(result).toBeNull();
    expect(countCurrent).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/demo-guard.test.ts`
Expected: FAIL — `Cannot find module '@/lib/demo-guard'` (the file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `src/lib/demo-guard.ts`:

```ts
import type { PrismaClient } from "@prisma/client";
import { DEMO_EMAIL } from "@/lib/config";

export type DemoGuardResult = { ok: false; error: string } | null;

// Blocks an action outright for the shared demo account. Call this at the
// top of every archive/delete action and every settings-changing action,
// before doing anything else. A no-op (returns null) for every other user.
export async function assertNotDemo(
  prisma: Pick<PrismaClient, "user">,
  userId: string,
): Promise<DemoGuardResult> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (user?.email === DEMO_EMAIL) {
    return { ok: false, error: "Not available in the shared demo — sign up for your own account to do this." };
  }
  return null;
}

// Caps how many rows a create action can add for the demo account, so the
// shared dataset can't grow without bound between resets. A no-op for
// every other user — countCurrent() is never even called for them.
export async function assertUnderDemoCap(
  prisma: Pick<PrismaClient, "user">,
  userId: string,
  countCurrent: () => Promise<number>,
  cap: number,
): Promise<DemoGuardResult> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (user?.email !== DEMO_EMAIL) return null;
  const current = await countCurrent();
  if (current >= cap) {
    return { ok: false, error: `Demo limit reached (${cap} max) — sign up to add more.` };
  }
  return null;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/demo-guard.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/demo-guard.ts src/lib/demo-guard.test.ts
git commit -m "feat(demo): add assertNotDemo/assertUnderDemoCap guard functions"
```

---

### Task 3: Wire the lazy auto-reset into `viewDemoAction` and stamp `demoResetAt` on manual reset

**Files:**
- Modify: `src/actions/auth.actions.ts`
- Modify: `src/actions/demo.actions.ts`

- [ ] **Step 1: Update `viewDemoAction`**

In `src/actions/auth.actions.ts`, the current `viewDemoAction` is:

```ts
export async function viewDemoAction(): Promise<void> {
  await signIn("credentials", {
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
    redirectTo: "/dashboard",
  });
}
```

Replace it with (add the `prisma` import already present in this file, and a new `seedDemoData` import):

```ts
import { seedDemoData } from "@/lib/demo-seed";

const DEMO_RESET_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

export async function viewDemoAction(): Promise<void> {
  const demoUser = await prisma.user.findUnique({ where: { email: DEMO_EMAIL } });
  if (demoUser) {
    const staleOrNeverReset =
      !demoUser.demoResetAt || Date.now() - demoUser.demoResetAt.getTime() > DEMO_RESET_INTERVAL_MS;
    if (staleOrNeverReset) {
      await seedDemoData(prisma, demoUser.id, demoUser.cycleStartDay);
      await prisma.user.update({ where: { id: demoUser.id }, data: { demoResetAt: new Date() } });
    }
  }

  await signIn("credentials", {
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
    redirectTo: "/dashboard",
  });
}
```

- [ ] **Step 2: Update `resetDemoDataAction` to stamp `demoResetAt`**

In `src/actions/demo.actions.ts`, change:

```ts
  await seedDemoData(prisma, user.id, user.cycleStartDay);

  revalidatePath("/", "layout");
  return { ok: true };
```

to:

```ts
  await seedDemoData(prisma, user.id, user.cycleStartDay);
  await prisma.user.update({ where: { id: user.id }, data: { demoResetAt: new Date() } });

  revalidatePath("/", "layout");
  return { ok: true };
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass (no existing test covers `viewDemoAction`/`resetDemoDataAction` directly — both are thin action-layer wrappers, matching this codebase's convention of not unit-testing the action layer itself).

- [ ] **Step 5: Commit**

```bash
git add src/actions/auth.actions.ts src/actions/demo.actions.ts
git commit -m "feat(demo): auto-reset demo data on view when it's over an hour stale"
```

---

### Task 4: `transaction.actions.ts` — cap creates, block delete

**Files:**
- Modify: `src/actions/transaction.actions.ts`

- [ ] **Step 1: Add the import**

```ts
import { assertNotDemo, assertUnderDemoCap } from "@/lib/demo-guard";
```

- [ ] **Step 2: Guard `createTransactionAction`**

Immediately after the existing `if (!parsed.success) return ...` check (before the account/category ownership checks already added by the earlier security work), add:

```ts
  const capResult = await assertUnderDemoCap(
    prisma,
    session.user.id,
    () => prisma.transaction.count({ where: { userId: session.user.id } }),
    100,
  );
  if (capResult) return capResult;
```

- [ ] **Step 3: Guard `createTransferAction`** the same way, right after its own `if (!parsed.success) return ...` check:

```ts
  const capResult = await assertUnderDemoCap(
    prisma,
    session.user.id,
    () => prisma.transaction.count({ where: { userId: session.user.id } }),
    100,
  );
  if (capResult) return capResult;
```

- [ ] **Step 4: Guard `deleteTransactionAction`**

Right after its `if (!session?.user) return ...` check, add:

```ts
  const demoResult = await assertNotDemo(prisma, session.user.id);
  if (demoResult) return demoResult;
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/actions/transaction.actions.ts
git commit -m "feat(demo): cap transaction/transfer creation and block deletion in demo mode"
```

---

### Task 5: `account.actions.ts` — cap create, block archive

**Files:**
- Modify: `src/actions/account.actions.ts`

- [ ] **Step 1: Add the import**

```ts
import { assertNotDemo, assertUnderDemoCap } from "@/lib/demo-guard";
```

- [ ] **Step 2: Guard `createAccountAction`** — right after its `if (!parsed.success) return ...`:

```ts
  const capResult = await assertUnderDemoCap(
    prisma,
    session.user.id,
    () => prisma.account.count({ where: { userId: session.user.id } }),
    100,
  );
  if (capResult) return capResult;
```

- [ ] **Step 3: Guard `archiveAccountAction`** — right after its `if (!session?.user) return ...`:

```ts
  const demoResult = await assertNotDemo(prisma, session.user.id);
  if (demoResult) return demoResult;
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/actions/account.actions.ts
git commit -m "feat(demo): cap account creation and block archiving in demo mode"
```

---

### Task 6: `category.actions.ts` — cap creates, block archives

**Files:**
- Modify: `src/actions/category.actions.ts`

- [ ] **Step 1: Add the import**

```ts
import { assertNotDemo, assertUnderDemoCap } from "@/lib/demo-guard";
```

- [ ] **Step 2: Guard `createCategoryAction`** — right after its `if (!parsed.success) return ...`:

```ts
  const capResult = await assertUnderDemoCap(
    prisma,
    session.user.id,
    () => prisma.category.count({ where: { userId: session.user.id } }),
    100,
  );
  if (capResult) return capResult;
```

- [ ] **Step 3: Guard `archiveCategoryAction`** — right after its `if (!session?.user) return ...`:

```ts
  const demoResult = await assertNotDemo(prisma, session.user.id);
  if (demoResult) return demoResult;
```

- [ ] **Step 4: Guard `createSubcategoryAction`** — right after its `if (!parsed.success) return ...`:

```ts
  const capResult = await assertUnderDemoCap(
    prisma,
    session.user.id,
    () => prisma.subcategory.count({ where: { userId: session.user.id } }),
    100,
  );
  if (capResult) return capResult;
```

- [ ] **Step 5: Guard `archiveSubcategoryAction`** — right after its `if (!session?.user) return ...`:

```ts
  const demoResult = await assertNotDemo(prisma, session.user.id);
  if (demoResult) return demoResult;
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/actions/category.actions.ts
git commit -m "feat(demo): cap category/subcategory creation and block archiving in demo mode"
```

---

### Task 7: `budget.actions.ts` — cap creates

**Files:**
- Modify: `src/actions/budget.actions.ts`

- [ ] **Step 1: Add the import**

```ts
import { assertUnderDemoCap } from "@/lib/demo-guard";
```

- [ ] **Step 2: Guard `createAllocationAction`** — right after its `if (!parsed.success) return ...` (this action already fetches `user` via `findUniqueOrThrow`; use `user.id`, not `session.user.id`):

```ts
  const capResult = await assertUnderDemoCap(
    prisma,
    user.id,
    () => prisma.budgetAllocation.count({ where: { userId: user.id } }),
    100,
  );
  if (capResult) return capResult;
```

- [ ] **Step 3: Guard `createBudgetPeriodAction`** — right after its own `if (!parsed.success) return ...` (this action uses `session.user.id` directly, not a separately fetched `user`):

```ts
  const capResult = await assertUnderDemoCap(
    prisma,
    session.user.id,
    () => prisma.budgetPeriod.count({ where: { userId: session.user.id } }),
    100,
  );
  if (capResult) return capResult;
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/actions/budget.actions.ts
git commit -m "feat(demo): cap budget period/allocation creation in demo mode"
```

---

### Task 8: `recurring.actions.ts` — cap create

**Files:**
- Modify: `src/actions/recurring.actions.ts`

- [ ] **Step 1: Add the import**

```ts
import { assertUnderDemoCap } from "@/lib/demo-guard";
```

- [ ] **Step 2: Guard `createRecurringRuleAction`** — right after its `if (!parsed.success) return ...` (this action already fetches `user` via `findUniqueOrThrow`; use `user.id`):

```ts
  const capResult = await assertUnderDemoCap(
    prisma,
    user.id,
    () => prisma.recurringRule.count({ where: { userId: user.id } }),
    100,
  );
  if (capResult) return capResult;
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/actions/recurring.actions.ts
git commit -m "feat(demo): cap recurring rule creation in demo mode"
```

---

### Task 9: `payable.actions.ts` — cap create

**Files:**
- Modify: `src/actions/payable.actions.ts`

- [ ] **Step 1: Add the import**

```ts
import { assertUnderDemoCap } from "@/lib/demo-guard";
```

- [ ] **Step 2: Guard `createPayableAction`** — right after its `if (!parsed.success) return ...`:

```ts
  const capResult = await assertUnderDemoCap(
    prisma,
    session.user.id,
    () => prisma.payable.count({ where: { userId: session.user.id } }),
    100,
  );
  if (capResult) return capResult;
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/actions/payable.actions.ts
git commit -m "feat(demo): cap bill (payable) creation in demo mode"
```

---

### Task 10: `recurring-payable.actions.ts` — cap create

**Files:**
- Modify: `src/actions/recurring-payable.actions.ts`

- [ ] **Step 1: Add the import**

```ts
import { assertUnderDemoCap } from "@/lib/demo-guard";
```

- [ ] **Step 2: Guard `createRecurringPayableAction`** — right after its `if (!parsed.success) return ...`:

```ts
  const capResult = await assertUnderDemoCap(
    prisma,
    session.user.id,
    () => prisma.recurringPayable.count({ where: { userId: session.user.id } }),
    100,
  );
  if (capResult) return capResult;
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/actions/recurring-payable.actions.ts
git commit -m "feat(demo): cap recurring bill creation in demo mode"
```

---

### Task 11: `loan.actions.ts` — cap create, block archive

**Files:**
- Modify: `src/actions/loan.actions.ts`

- [ ] **Step 1: Add the import**

```ts
import { assertNotDemo, assertUnderDemoCap } from "@/lib/demo-guard";
```

- [ ] **Step 2: Guard `createLoanAction`** — right after its `if (!parsed.success) return ...`:

```ts
  const capResult = await assertUnderDemoCap(
    prisma,
    session.user.id,
    () => prisma.loan.count({ where: { userId: session.user.id } }),
    100,
  );
  if (capResult) return capResult;
```

- [ ] **Step 3: Guard `archiveLoanAction`** — right after its `if (!session?.user) return ...`:

```ts
  const demoResult = await assertNotDemo(prisma, session.user.id);
  if (demoResult) return demoResult;
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/actions/loan.actions.ts
git commit -m "feat(demo): cap loan creation and block archiving in demo mode"
```

---

### Task 12: `credit-card.actions.ts` — cap create

**Files:**
- Modify: `src/actions/credit-card.actions.ts`

- [ ] **Step 1: Add the import**

```ts
import { assertUnderDemoCap } from "@/lib/demo-guard";
```

(Note: this file already imports `assertOwnedAccount` from `@/lib/accounts` — add the new import as its own line, don't merge into that one.)

- [ ] **Step 2: Guard `createCreditCardAction`** — right after its `if (!parsed.success) return ...`:

```ts
  const capResult = await assertUnderDemoCap(
    prisma,
    session.user.id,
    () => prisma.creditCard.count({ where: { userId: session.user.id } }),
    100,
  );
  if (capResult) return capResult;
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/actions/credit-card.actions.ts
git commit -m "feat(demo): cap credit card creation in demo mode"
```

---

### Task 13: `installment-purchase.actions.ts` — cap create, block archive

**Files:**
- Modify: `src/actions/installment-purchase.actions.ts`

- [ ] **Step 1: Add the import**

```ts
import { assertNotDemo, assertUnderDemoCap } from "@/lib/demo-guard";
```

- [ ] **Step 2: Guard `createInstallmentPurchaseAction`** — right after its `if (!parsed.success) return ...`:

```ts
  const capResult = await assertUnderDemoCap(
    prisma,
    session.user.id,
    () => prisma.installmentPurchase.count({ where: { userId: session.user.id } }),
    100,
  );
  if (capResult) return capResult;
```

- [ ] **Step 3: Guard `archiveInstallmentPurchaseAction`** — right after its `if (!session?.user) return ...`:

```ts
  const demoResult = await assertNotDemo(prisma, session.user.id);
  if (demoResult) return demoResult;
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/actions/installment-purchase.actions.ts
git commit -m "feat(demo): cap installment purchase creation and block archiving in demo mode"
```

---

### Task 14: `calendar.actions.ts` — cap create, block delete

**Files:**
- Modify: `src/actions/calendar.actions.ts`

- [ ] **Step 1: Add the import**

```ts
import { assertNotDemo, assertUnderDemoCap } from "@/lib/demo-guard";
```

- [ ] **Step 2: Guard `createReminderAction`** — right after its `if (!parsed.success) return ...` (this action takes `session.user.id`, not a separately fetched `user`):

```ts
  const capResult = await assertUnderDemoCap(
    prisma,
    session.user.id,
    () => prisma.customReminder.count({ where: { userId: session.user.id } }),
    100,
  );
  if (capResult) return capResult;
```

- [ ] **Step 3: Guard `deleteReminderAction`** — right after its `if (!session?.user) return ...`:

```ts
  const demoResult = await assertNotDemo(prisma, session.user.id);
  if (demoResult) return demoResult;
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/actions/calendar.actions.ts
git commit -m "feat(demo): cap reminder creation and block deletion in demo mode"
```

---

### Task 15: `shopping-catalog.actions.ts` — cap create, block archive

**Files:**
- Modify: `src/actions/shopping-catalog.actions.ts`

- [ ] **Step 1: Add the import**

```ts
import { assertNotDemo, assertUnderDemoCap } from "@/lib/demo-guard";
```

- [ ] **Step 2: Guard `createCatalogItemAction`** — right after its `if (!parsed.success) return ...`:

```ts
  const capResult = await assertUnderDemoCap(
    prisma,
    session.user.id,
    () => prisma.shoppingCatalogItem.count({ where: { userId: session.user.id } }),
    100,
  );
  if (capResult) return capResult;
```

- [ ] **Step 3: Guard `archiveCatalogItemAction`** — right after its `if (!session?.user) return ...`:

```ts
  const demoResult = await assertNotDemo(prisma, session.user.id);
  if (demoResult) return demoResult;
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/actions/shopping-catalog.actions.ts
git commit -m "feat(demo): cap shopping catalog item creation and block archiving in demo mode"
```

---

### Task 16: `shopping-list.actions.ts` — cap creates, block deletes

**Files:**
- Modify: `src/actions/shopping-list.actions.ts`

- [ ] **Step 1: Add the import**

```ts
import { assertNotDemo, assertUnderDemoCap } from "@/lib/demo-guard";
```

- [ ] **Step 2: Guard `createListAction`** — right after its `if (!parsed.success) return ...`:

```ts
  const capResult = await assertUnderDemoCap(
    prisma,
    session.user.id,
    () => prisma.shoppingList.count({ where: { userId: session.user.id } }),
    100,
  );
  if (capResult) return capResult;
```

- [ ] **Step 3: Guard `addItemAction`** — right after its `if (!parsed.success) return ...`:

```ts
  const capResult = await assertUnderDemoCap(
    prisma,
    session.user.id,
    () => prisma.shoppingListItem.count({ where: { userId: session.user.id } }),
    100,
  );
  if (capResult) return capResult;
```

- [ ] **Step 4: Guard `deleteItemAction`** — right after its `if (!session?.user) return ...`:

```ts
  const demoResult = await assertNotDemo(prisma, session.user.id);
  if (demoResult) return demoResult;
```

- [ ] **Step 5: Guard `deleteListAction`** — right after its `if (!session?.user) return ...`:

```ts
  const demoResult = await assertNotDemo(prisma, session.user.id);
  if (demoResult) return demoResult;
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/actions/shopping-list.actions.ts
git commit -m "feat(demo): cap shopping list/item creation and block deletion in demo mode"
```

---

### Task 17: `receipt.actions.ts` — cap create, block deletes

**Files:**
- Modify: `src/actions/receipt.actions.ts`

- [ ] **Step 1: Add the import**

```ts
import { assertNotDemo, assertUnderDemoCap } from "@/lib/demo-guard";
```

- [ ] **Step 2: Guard `createDraftReceiptAction`** — right after its `if (!parsed.success) return ...`:

```ts
  const capResult = await assertUnderDemoCap(
    prisma,
    session.user.id,
    () => prisma.receipt.count({ where: { userId: session.user.id } }),
    100,
  );
  if (capResult) return capResult;
```

- [ ] **Step 3: Guard `deleteLineAction`** — right after its `if (!session?.user) return ...`:

```ts
  const demoResult = await assertNotDemo(prisma, session.user.id);
  if (demoResult) return demoResult;
```

- [ ] **Step 4: Guard `removeReceiptImageAction`** — right after its `if (!session?.user) return ...`:

```ts
  const demoResult = await assertNotDemo(prisma, session.user.id);
  if (demoResult) return demoResult;
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/actions/receipt.actions.ts
git commit -m "feat(demo): cap receipt creation and block line/image deletion in demo mode"
```

---

### Task 18: `year-plan.actions.ts` — cap creates, block deletes

**Files:**
- Modify: `src/actions/year-plan.actions.ts`

- [ ] **Step 1: Add the import**

```ts
import { assertNotDemo, assertUnderDemoCap } from "@/lib/demo-guard";
```

- [ ] **Step 2: Guard `createYearPlanAction`** — right after its `if (!parsed.success) return ...`:

```ts
  const capResult = await assertUnderDemoCap(
    prisma,
    session.user.id,
    () => prisma.yearPlan.count({ where: { userId: session.user.id } }),
    100,
  );
  if (capResult) return capResult;
```

- [ ] **Step 3: Guard `deleteYearPlanAction`** — right after its `if (!session?.user) return ...`:

```ts
  const demoResult = await assertNotDemo(prisma, session.user.id);
  if (demoResult) return demoResult;
```

- [ ] **Step 4: Guard `addPhaseAction`** — right after its `if (!parsed.success) return ...`:

```ts
  const capResult = await assertUnderDemoCap(
    prisma,
    session.user.id,
    () => prisma.yearPlanPhase.count({ where: { userId: session.user.id } }),
    100,
  );
  if (capResult) return capResult;
```

- [ ] **Step 5: Guard `deletePhaseAction`** — right after its `if (!session?.user) return ...`:

```ts
  const demoResult = await assertNotDemo(prisma, session.user.id);
  if (demoResult) return demoResult;
```

- [ ] **Step 6: Guard `addIncomeForecastAction`** — right after its `if (!parsed.success) return ...`:

```ts
  const capResult = await assertUnderDemoCap(
    prisma,
    session.user.id,
    () => prisma.incomeForecast.count({ where: { userId: session.user.id } }),
    100,
  );
  if (capResult) return capResult;
```

- [ ] **Step 7: Guard `deleteIncomeForecastAction`** — right after its `if (!session?.user) return ...`:

```ts
  const demoResult = await assertNotDemo(prisma, session.user.id);
  if (demoResult) return demoResult;
```

- [ ] **Step 8: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 9: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass.

- [ ] **Step 10: Commit**

```bash
git add src/actions/year-plan.actions.ts
git commit -m "feat(demo): cap year plan/phase/forecast creation and block deletion in demo mode"
```

---

### Task 19: `savings-goal.actions.ts` — cap create-only branch of the upsert

**Files:**
- Modify: `src/actions/savings-goal.actions.ts`

- [ ] **Step 1: Add the import**

```ts
import { assertUnderDemoCap } from "@/lib/demo-guard";
```

- [ ] **Step 2: Guard the create branch**

In `upsertSavingsGoalAction`, right after its `if (!parsed.success) return ...`, add a check that only counts against the cap when this `accountId` doesn't already have a goal (an update to an existing goal never adds a row):

```ts
  const existingGoal = await prisma.savingsGoal.findUnique({ where: { accountId } });
  if (!existingGoal) {
    const capResult = await assertUnderDemoCap(
      prisma,
      session.user.id,
      () => prisma.savingsGoal.count({ where: { userId: session.user.id } }),
      100,
    );
    if (capResult) return capResult;
  }
```

(`SavingsGoal.accountId` is `@unique` in `prisma/schema.prisma`, so `findUnique({ where: { accountId } })` is valid.)

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/actions/savings-goal.actions.ts
git commit -m "feat(demo): cap savings goal creation (not updates) in demo mode"
```

---

### Task 20: `settings.actions.ts` — block both settings actions

**Files:**
- Modify: `src/actions/settings.actions.ts`

- [ ] **Step 1: Add the import**

```ts
import { assertNotDemo } from "@/lib/demo-guard";
```

- [ ] **Step 2: Guard `updateThemeModeAction`** — right after its `if (!parsed.success) return ...`:

```ts
  const demoResult = await assertNotDemo(prisma, session.user.id);
  if (demoResult) return demoResult;
```

- [ ] **Step 3: Guard `updateReceiptAutoDeleteImagesAction`** — right after its `if (!session?.user) return ...`:

```ts
  const demoResult = await assertNotDemo(prisma, session.user.id);
  if (demoResult) return demoResult;
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/actions/settings.actions.ts
git commit -m "feat(demo): block theme/receipt-auto-delete settings changes in demo mode"
```

---

### Task 21: Demo-mode banner

**Files:**
- Create: `src/components/nav/demo-banner.tsx`
- Modify: `src/app/(app)/layout.tsx`

- [ ] **Step 1: Create the banner component**

Create `src/components/nav/demo-banner.tsx`:

```tsx
import Link from "next/link";

export function DemoBanner() {
  return (
    <div className="flex items-center justify-center gap-2 bg-amber-100 px-4 py-2 text-center text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">
      <span>You&apos;re viewing the shared demo — changes reset periodically.</span>
      <Link href="/signup" className="font-medium underline underline-offset-2">
        Sign up to keep your own data
      </Link>
    </div>
  );
}
```

- [ ] **Step 2: Wire it into the app layout**

In `src/app/(app)/layout.tsx`, add the import:

```ts
import { DemoBanner } from "@/components/nav/demo-banner";
import { DEMO_EMAIL } from "@/lib/config";
```

Then change the returned JSX from:

```tsx
  return (
    <div className="flex min-h-screen bg-background">
      <SideNav accounts={accounts} categories={categories} />
      <div className="flex flex-1 flex-col">
        <TopNav accounts={accounts} categories={categories} email={session?.user?.email ?? null} />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
      </div>
    </div>
  );
```

to:

```tsx
  const isDemo = session?.user?.email === DEMO_EMAIL;

  return (
    <div className="flex min-h-screen bg-background">
      <SideNav accounts={accounts} categories={categories} />
      <div className="flex flex-1 flex-col">
        {isDemo && <DemoBanner />}
        <TopNav accounts={accounts} categories={categories} email={session?.user?.email ?? null} />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
      </div>
    </div>
  );
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/nav/demo-banner.tsx "src/app/(app)/layout.tsx"
git commit -m "feat(demo): show a persistent banner while viewing the shared demo account"
```

---

### Task 22: Full verification sweep

No commit for this task — verification only.

- [ ] **Step 1: Full unit test suite**

Run: `npx vitest run`
Expected: all tests pass (the new `demo-guard.test.ts` plus every existing suite, unchanged in count/behavior except for the new file).

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Lint**

Run: `npx eslint src e2e`
Expected: no new errors (pre-existing warnings noted elsewhere in this project are fine).

- [ ] **Step 4: Playwright e2e**

Run: `npx playwright test`
Expected: all existing specs still pass (none of them exercise demo mode, so this is purely a regression check that nothing broke for real accounts).

- [ ] **Step 5: Production build**

Run: `npx next build`
Expected: builds cleanly.

- [ ] **Step 6: Manual verification in the browser**

1. Reset demo data to a known state: `npm run db:seed-demo`.
2. Start the dev server preview, open `/`, click "View Demo" (or navigate straight to `/dashboard` while logged out and use the login flow's demo entry point — check `src/components/landing/view-demo-button.tsx` for the actual button location).
3. Confirm the demo banner appears with the "Sign up to keep your own data" link.
4. Try to archive an account (or any other blocked action) — confirm it's rejected with "Not available in the shared demo — sign up for your own account to do this." and nothing changes.
5. Try to change the theme in Settings — confirm the same rejection.
6. Temporarily lower one cap in the source (e.g. change the transaction cap to `1` in `transaction.actions.ts`), restart the dev server, create one transaction as the demo user, then try to create a second — confirm it's rejected with "Demo limit reached (1 max) — sign up to add more." Revert the temporary cap change afterward (don't commit it).
7. Log in as a real (non-demo) account (e.g. the existing `onboarding-test@example.com` pattern from prior verification, or create a fresh one) and confirm every one of the above actions works completely normally with no banner and no blocking.
8. Reset demo data again afterward: `npm run db:seed-demo`.

- [ ] **Step 7: Report results**

Summarize pass/fail for each of the above steps to the user. Do not commit anything from this task.
