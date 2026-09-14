# Onboarding First-Account Step — Design

**Goal:** Give a brand-new user a chance to create their first Account during onboarding, so they don't land on an empty dashboard not knowing they need to visit Accounts first.

**Context:** Onboarding today only asks for `cycleStartDay` (currency is plumbed through the schema/action but has no UI field yet, so it's effectively always `"PHP"` — an existing gap, out of scope here). An account's "Opening balance" already exists as a per-account field on the Accounts page, but nothing during onboarding surfaces it. This design adds a second, skippable onboarding step for creating one account.

## Flow

Onboarding becomes a 2-step client-side wizard on the same `/onboarding` route (no new route, just internal step state):

- **Step 1** (unchanged): Cycle start day. "Continue" advances locally to step 2 — no server call yet.
- **Step 2** (new): "Add your first account" — Name, Account type (select, defaults to `CHECKING`), Opening balance (number, defaults to `0`). Two actions: **"Add account & finish"** (primary) and **"Skip for now"** (ghost/secondary) — either one completes onboarding and redirects to `/dashboard`. A "Back" link returns to step 1.

Step 2 does **not** ask for Purpose, Primary-funding, color/icon, or currency:
- Purpose defaults to `"DISPOSABLE"`, `isPrimaryFundingAccount` defaults to `true` — the sensible choice for someone's very first account.
- `color`/`icon` default to `"blue"`/`"landmark"`, matching `AccountFormDialog`'s own new-account defaults.
- Currency is not asked again — it reuses whatever `currency` step 1 is about to save for the user (today, always `"PHP"`).

## Backend

One new server action, `completeOnboardingWithAccountAction`, sitting alongside the existing `completeOnboardingAction` (which continues to serve the "Skip for now" path unchanged — it already does exactly what skipping needs: save `cycleStartDay`/`currency`, stamp `onboardedAt`).

The new action wraps two writes in one `prisma.$transaction` — the user update (`cycleStartDay`, `currency`, `onboardedAt`) and the account creation — so onboarding is never left half-done (a user with `onboardedAt` set but no account, or an orphaned account on a user still mid-onboarding). This mirrors the existing transactional pattern in `receipts.ts::confirmReceipt`.

A new `firstAccountSchema` (in `src/lib/validations/onboarding.ts`) validates the three step-2 fields:
```ts
export const firstAccountSchema = z.object({
  name: z.string().min(1, "Name is required"),
  accountType: z.enum(ACCOUNT_TYPES),
  openingBalance: z.number(),
});
```

`src/lib/onboarding.ts` gets a new function:
```ts
export async function completeOnboardingWithAccount(
  prisma: Pick<PrismaClient, "user" | "account" | "$transaction">,
  userId: string,
  input: OnboardingInput,
  account: { name: string; accountType: string; openingBalance: number }, // minor units
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { cycleStartDay: input.cycleStartDay, currency: input.currency, onboardedAt: new Date() },
    });
    await tx.account.create({
      data: {
        userId,
        name: account.name,
        accountType: account.accountType,
        openingBalance: account.openingBalance,
        currency: input.currency,
        purpose: "DISPOSABLE",
        isPrimaryFundingAccount: true,
        color: "blue",
        icon: "landmark",
        includeInLiquidFunds: true, // DISPOSABLE is always liquid — same rule as accounts.ts's deriveIncludeInLiquidFunds
      },
    });
  });
}
```

`src/actions/onboarding.actions.ts` gets `completeOnboardingWithAccountAction(formData)`: auth check → parse `onboardingSchema` fields → parse `firstAccountSchema` fields → convert `openingBalance` to minor units via `toMinorUnits` (same helper every other account/transaction action already uses) → call `completeOnboardingWithAccount` → return `{ ok: true } | { ok: false; error }`.

## Files Touched

- `src/app/onboarding/page.tsx` — rewritten as a 2-step wizard (local `step` state, no new route)
- `src/lib/validations/onboarding.ts` — add `firstAccountSchema`
- `src/lib/onboarding.ts` — add `completeOnboardingWithAccount`
- `src/actions/onboarding.actions.ts` — add `completeOnboardingWithAccountAction`
- `src/lib/onboarding.test.ts` — new tests for `completeOnboardingWithAccount`

## Non-Goals

- No changes to the existing "Skip for now" path's server action (`completeOnboardingAction` is reused as-is).
- No currency picker added to onboarding (out of scope — separate existing gap).
- No new Playwright e2e test — the demo-seed script bypasses onboarding entirely (`onboardedAt` is pre-set), so there's no existing e2e coverage of onboarding today, and this change follows that same convention (action-layer changes here are verified via unit tests + manual check, not new e2e specs).

## Testing Approach

TDD unit tests for `completeOnboardingWithAccount` in `src/lib/onboarding.test.ts`, following the existing file's fake-prisma convention:
- Updates the user's `cycleStartDay`/`currency`/`onboardedAt` and creates the account, both inside `$transaction`.
- Creates the account with the fixed defaults (`purpose: "DISPOSABLE"`, `isPrimaryFundingAccount: true`, `includeInLiquidFunds: true`, `color: "blue"`, `icon: "landmark"`).
