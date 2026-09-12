# Plan 3B.4b: Settings Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The second half of Plan 3B.4 (and the last piece of Plan 3B) — move Categories and Recurring-rule management into Settings, and finish the top nav to match the design spec's final desktop order, closing out the "UI/routing change" the spec flagged back in Plan 2A as landing "Plan 2B onward" but which never actually happened until now.

**Architecture:** No new domain logic, no schema changes — this is UI relocation only. Every existing component (`CategoryFormDialog`, `CategoryList`, `DueList`, `RuleFormDialog`, `RuleList`) is reused completely unchanged; only where they're rendered moves:

- `src/app/(app)/categories/page.tsx` and `src/app/(app)/recurring/page.tsx` are deleted.
- Their content becomes two new sections on the Settings page (which already has an "Appearance" section from Plan 3B.4a), via two new thin wrapper components: `CategoriesSettings` and `RecurringSettings` — each just the same JSX the old pages had, reusing the same data-fetching the old pages did.
- `category.actions.ts`/`recurring.actions.ts` each call `revalidatePath` after a mutation — those calls move from `"/categories"`/`"/recurring"` to `"/settings"`, since that's where the UI now lives.
- The nav's `links` array drops the `Categories` and `Recurring` entries, leaving exactly the spec's desktop order: Dashboard, Transactions, Budget, Bills, Accounts, Loans & Cards, Reports, Settings.

**Scope boundary — explicitly NOT in this plan:** the spec's separate mobile nav (Home/Transactions/Add/Bills/Accounts + a "More" menu holding Loans & Cards/Reports/Settings) — this app has one nav component today with no responsive breakpoint-specific menu at all, and building that is a distinct, larger responsive-navigation feature better suited to Plan 4's accessibility/responsive review, not a two-link nav cleanup; any change to how categories or recurring rules themselves work (domain logic, validation, forms) — every one of those pieces is reused byte-for-byte.

**Tech Stack:** No changes.

**Read first:** `src/app/(app)/categories/page.tsx` and `src/app/(app)/recurring/page.tsx` (being deleted — their exact JSX is what moves into the new wrapper components); `src/app/(app)/settings/page.tsx` (Plan 3B.4a's current version, with only the Appearance section — this plan adds to it, not replaces it).

---

### Task 1: Move Categories into Settings

**Files:**
- Create: `src/components/settings/categories-settings.tsx`
- Delete: `src/app/(app)/categories/page.tsx`
- Modify: `src/actions/category.actions.ts`

- [ ] **Step 1: Create the wrapper component**

```typescript
// src/components/settings/categories-settings.tsx
import { CategoryFormDialog } from "@/components/categories/category-form-dialog";
import { CategoryList } from "@/components/categories/category-list";

type SubcategoryRow = { id: string; name: string };
type CategoryRow = {
  id: string;
  name: string;
  type: string;
  color: string;
  icon: string;
  subcategories: SubcategoryRow[];
};

export function CategoriesSettings({ categories }: { categories: CategoryRow[] }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <CategoryFormDialog />
      </div>
      <CategoryList categories={categories} />
    </div>
  );
}
```

- [ ] **Step 2: Delete the old Categories page**

Delete `src/app/(app)/categories/page.tsx` (and the now-empty `src/app/(app)/categories/` directory, if your tooling leaves it behind).

- [ ] **Step 3: Point `category.actions.ts`'s revalidation at Settings**

In `src/actions/category.actions.ts`, replace every occurrence of:

```typescript
revalidatePath("/categories");
```

with:

```typescript
revalidatePath("/settings");
```

(There are 4 occurrences — in `createCategoryAction`, `updateCategoryAction`, `archiveCategoryAction`/subcategory equivalents. Replace all of them; don't leave any pointed at the deleted route.)

- [ ] **Step 4: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no errors. `CategoriesSettings` isn't rendered anywhere yet (that's Task 3) — an unused-export warning is not an error and `tsc --noEmit` won't flag it.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: move Categories management into Settings"
```

---

### Task 2: Move Recurring-rule management into Settings

**Files:**
- Create: `src/components/settings/recurring-settings.tsx`
- Delete: `src/app/(app)/recurring/page.tsx`
- Modify: `src/actions/recurring.actions.ts`

- [ ] **Step 1: Create the wrapper component**

```typescript
// src/components/settings/recurring-settings.tsx
import { DueList } from "@/components/recurring/due-list";
import { RuleFormDialog } from "@/components/recurring/rule-form-dialog";
import { RuleList } from "@/components/recurring/rule-list";

type AccountOption = { id: string; name: string; currency: string };
type CategoryOption = { id: string; name: string };

type DueRule = {
  id: string;
  name: string;
  amount: number;
  nextDate: Date;
  account: { name: string; currency: string };
};

type RuleRow = {
  id: string;
  name: string;
  transactionType: string;
  amount: number;
  frequency: string;
  intervalDays: number | null;
  nextDate: Date;
  accountId: string;
  categoryId: string | null;
  active: boolean;
  account: { name: string; currency: string };
  category: { name: string } | null;
};

export function RecurringSettings({
  dueRules,
  allRules,
  accounts,
  categories,
}: {
  dueRules: DueRule[];
  allRules: RuleRow[];
  accounts: AccountOption[];
  categories: CategoryOption[];
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <RuleFormDialog accounts={accounts} categories={categories} />
      </div>
      <DueList rules={dueRules} />
      <RuleList rules={allRules} accounts={accounts} categories={categories} />
    </div>
  );
}
```

- [ ] **Step 2: Delete the old Recurring page**

Delete `src/app/(app)/recurring/page.tsx` (and the now-empty `src/app/(app)/recurring/` directory, if left behind).

- [ ] **Step 3: Point `recurring.actions.ts`'s revalidation at Settings**

In `src/actions/recurring.actions.ts`, replace every occurrence of:

```typescript
revalidatePath("/recurring");
```

with:

```typescript
revalidatePath("/settings");
```

(There are 5 occurrences — in `createRecurringRuleAction`, `updateRecurringRuleAction`, `toggleRecurringRuleActiveAction`, `confirmRecurringOccurrenceAction`, `skipRecurringOccurrenceAction`. Replace all of them.)

- [ ] **Step 4: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no errors (same note as Task 1 Step 4 — the render wiring happens in Task 3).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: move Recurring-rule management into Settings"
```

---

### Task 3: Assemble the full Settings page and finish the nav

**Files:**
- Modify: `src/app/(app)/settings/page.tsx`, `src/components/nav/top-nav.tsx`

- [ ] **Step 1: Update the Settings page**

Replace `src/app/(app)/settings/page.tsx` with:

```typescript
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { listCategories } from "@/lib/categories";
import { listAccounts } from "@/lib/accounts";
import { AppearanceSettings } from "@/components/settings/appearance-settings";
import { CategoriesSettings } from "@/components/settings/categories-settings";
import { RecurringSettings } from "@/components/settings/recurring-settings";

export default async function SettingsPage() {
  const session = await auth();
  const user = await prisma.user.findUniqueOrThrow({ where: { id: session!.user.id } });

  const [categories, accounts, dueRules, allRules] = await Promise.all([
    listCategories(prisma, user.id),
    listAccounts(prisma, user.id),
    prisma.recurringRule.findMany({
      where: { userId: user.id, active: true, nextDate: { lte: new Date() } },
      orderBy: { nextDate: "asc" },
      include: { account: true },
    }),
    prisma.recurringRule.findMany({
      where: { userId: user.id },
      orderBy: { nextDate: "asc" },
      include: { account: true, category: true },
    }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Settings</h1>

      <div>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">Appearance</h2>
        <AppearanceSettings initialAccentColor={user.accentColor} initialThemeMode={user.themeMode} />
      </div>

      <div>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">Categories</h2>
        <CategoriesSettings categories={categories} />
      </div>

      <div>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">Recurring</h2>
        <RecurringSettings dueRules={dueRules} allRules={allRules} accounts={accounts} categories={categories} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Finish the nav**

Replace the `links` array in `src/components/nav/top-nav.tsx` with the spec's exact desktop order — dropping `Categories` and `Recurring`:

```typescript
const links = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/transactions", label: "Transactions" },
  { href: "/budget", label: "Budget" },
  { href: "/bills", label: "Bills" },
  { href: "/accounts", label: "Accounts" },
  { href: "/loans-cards", label: "Loans & Cards" },
  { href: "/reports", label: "Reports" },
  { href: "/settings", label: "Settings" },
];
```

- [ ] **Step 3: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: assemble Categories and Recurring into Settings; finish the nav order"
```

---

### Task 4: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

```bash
npm test
```

Expected: all 205 existing tests still pass — this plan adds no new domain logic, so no new tests are expected.

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Browser walkthrough**

Start the dev server, log in as `demo@example.com` / `demopassword123`, and manually verify (fixing any real bug found, then re-running Steps 1–2):

- The top nav now reads exactly: Dashboard, Transactions, Budget, Bills, Accounts, Loans & Cards, Reports, Settings — no "Categories" or "Recurring" entries anywhere in it.
- Visiting `/categories` or `/recurring` directly returns Next.js's normal 404 (confirming the pages are actually gone, not just unlinked).
- Settings now has three sections in order: Appearance, Categories, Recurring.
- In the Categories section: add a category, confirm it appears in the list without a page navigation (same page, just revalidated); edit it; archive it — all three should behave exactly as they did on the old `/categories` page.
- In the Recurring section: create a recurring rule with `nextDate` = today — confirm it shows up in the "Due now" list right there in Settings; confirm it and skip it work exactly as before; deactivate/reactivate it.
- Confirm the global "Add Transaction" modal (used everywhere) still offers the full category list — this reads from `listCategories` independently of the Settings page and shouldn't have been touched, but worth a quick check given how much category-related code this plan moved around.
- Clean up any test category/recurring rule created during this walkthrough, the same way prior plans' verification steps have.

- [ ] **Step 4: Confirm a clean working tree**

```bash
git status --short
```

Expected: no output (everything already committed; verification found no code changes needed, or any fix was committed above).
