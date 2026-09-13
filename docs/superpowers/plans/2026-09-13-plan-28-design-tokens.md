# Design Tokens & Accent-Picker Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Phase 20.1 of the visual-design roadmap (`docs/superpowers/plans/2026-09-13-plan-20-visual-design-and-account-grouping.md`) — replace the 7-accent green-default token system with a fixed Wine identity, add semantic success/warning/danger/info tokens, add the typography scale, revise the chart palette away from green, and remove the now-dead accent-picker plumbing (confirmed with the user: drop entirely, no UI ever rendered it anyway).

**Architecture:** Almost the entire change is CSS custom-property values in `src/app/globals.css` — no component logic changes for the chart colors (both chart components already read `var(--chart-1)`/`var(--chart-2)`, so only the token values move). The `accentColor` removal is a small, mechanical deletion across `schema.prisma`, `src/lib/settings.ts`, `src/lib/onboarding.ts`, their validations/actions/tests, and `layout.tsx`'s `data-accent` attribute — `accentColor` already has no picker UI anywhere today (verified: `AppearanceSettings` only renders a theme-mode picker; `onboarding/page.tsx`'s form has no accent field, just a hardcoded `"wine"` default), so nothing user-visible changes except the palette itself.

**Tech Stack:** CSS custom properties (Tailwind v4 `@theme inline`), Prisma schema push (no migrations directory — this project uses `prisma db push`), Vitest.

---

### Task 1: Remove `accentColor` from the schema and every call site

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `src/lib/settings.ts`, `src/lib/settings.test.ts`
- Modify: `src/lib/validations/settings.ts`
- Modify: `src/actions/settings.actions.ts`
- Modify: `src/lib/onboarding.ts`, `src/lib/onboarding.test.ts`
- Modify: `src/lib/validations/onboarding.ts`
- Modify: `src/actions/onboarding.actions.ts`
- Modify: `src/app/onboarding/page.tsx`
- Modify: `src/app/layout.tsx`
- Modify: `src/lib/constants/appearance.ts`

- [ ] **Step 1: Remove the column from the schema**

In `prisma/schema.prisma`, remove this line from `model User`:

```prisma
  accentColor   String   @default("wine")
```

- [ ] **Step 2: Update `src/lib/constants/appearance.ts`**

Remove `ACCENT_COLORS`, `AccentColor`, `ACCENT_COLOR_VALUES` — keep only:

```ts
export const THEME_MODES = ["light", "dark", "system"] as const;
export type ThemeMode = (typeof THEME_MODES)[number];
```

- [ ] **Step 3: Update `src/lib/validations/settings.ts`**

```ts
import { z } from "zod";
import { THEME_MODES } from "@/lib/constants/appearance";

export const themeModeSchema = z.object({
  themeMode: z.enum(THEME_MODES),
});
```

- [ ] **Step 4: Update `src/lib/settings.ts`**

Remove `updateAccentColor` entirely, keep `updateThemeMode` unchanged.

- [ ] **Step 5: Update `src/lib/settings.test.ts`**

Remove the `describe("updateAccentColor", ...)` block, keep `describe("updateThemeMode", ...)` unchanged.

- [ ] **Step 6: Run the settings test**

Run: `npx vitest run src/lib/settings.test.ts`
Expected: PASS (1 test — `updateThemeMode` only).

- [ ] **Step 7: Update `src/actions/settings.actions.ts`**

Remove `updateAccentColorAction` and the now-unused `accentColorSchema`/`updateAccentColor` imports. Keep `updateThemeModeAction` unchanged.

- [ ] **Step 8: Update `src/lib/onboarding.ts`**

```ts
import type { PrismaClient } from "@prisma/client";

export type OnboardingInput = {
  cycleStartDay: number;
  currency: string;
};

export async function completeOnboarding(
  prisma: Pick<PrismaClient, "user">,
  userId: string,
  input: OnboardingInput,
): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: {
      cycleStartDay: input.cycleStartDay,
      currency: input.currency,
      onboardedAt: new Date(),
    },
  });
}
```

- [ ] **Step 9: Update `src/lib/onboarding.test.ts`**

```ts
import { describe, expect, it, vi } from "vitest";
import { completeOnboarding } from "@/lib/onboarding";

function makeFakePrisma() {
  return {
    user: {
      update: vi.fn().mockResolvedValue({}),
    },
  } as any;
}

describe("completeOnboarding", () => {
  it("saves the cycle day and currency, and stamps onboardedAt", async () => {
    const prisma = makeFakePrisma();

    await completeOnboarding(prisma, "user-1", {
      cycleStartDay: 25,
      currency: "PHP",
    });

    expect(prisma.user.update).toHaveBeenCalledTimes(1);
    const args = prisma.user.update.mock.calls[0][0];
    expect(args.where).toEqual({ id: "user-1" });
    expect(args.data.cycleStartDay).toBe(25);
    expect(args.data.currency).toBe("PHP");
    expect(args.data.onboardedAt).toBeInstanceOf(Date);
  });
});
```

- [ ] **Step 10: Run the onboarding test**

Run: `npx vitest run src/lib/onboarding.test.ts`
Expected: PASS.

- [ ] **Step 11: Update `src/lib/validations/onboarding.ts`**

```ts
import { z } from "zod";

export const onboardingSchema = z.object({
  cycleStartDay: z.number().int().min(1).max(31),
  currency: z.string().min(1),
});
```

- [ ] **Step 12: Update `src/actions/onboarding.actions.ts`**

```ts
"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { onboardingSchema } from "@/lib/validations/onboarding";
import { completeOnboarding } from "@/lib/onboarding";

export type OnboardingResult = { ok: true } | { ok: false; error: string };

export async function completeOnboardingAction(formData: FormData): Promise<OnboardingResult> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, error: "You must be logged in" };
  }

  const parsed = onboardingSchema.safeParse({
    cycleStartDay: Number(formData.get("cycleStartDay")),
    currency: formData.get("currency"),
  });

  if (!parsed.success) {
    return { ok: false, error: "Enter a valid cycle start day (1-31) and currency" };
  }

  await completeOnboarding(prisma, session.user.id, parsed.data);

  return { ok: true };
}
```

- [ ] **Step 13: Update `src/app/onboarding/page.tsx`**

Remove `defaultValues: { ..., accentColor: "wine" }`'s `accentColor` field and the `formData.set("accentColor", values.accentColor)` line. The rest of the form is unchanged.

- [ ] **Step 14: Update `src/app/layout.tsx`**

Remove `accentColor: true` from the `select` clause and drop the `data-accent={...}` attribute from the `<html>` tag entirely:

```tsx
  const user = session?.user
    ? await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { themeMode: true },
      })
    : null;

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${manrope.variable} h-full antialiased`}
    >
```

- [ ] **Step 15: Push the schema change**

Run: `npm run db:push`
Expected: confirms the `accentColor` column is dropped (review the prompt/output carefully — this is a destructive column drop; confirm only this column is affected, nothing else).

- [ ] **Step 16: Typecheck and lint**

Run: `npx tsc --noEmit && npx eslint src/lib/settings.ts src/lib/settings.test.ts src/lib/validations/settings.ts src/actions/settings.actions.ts src/lib/onboarding.ts src/lib/onboarding.test.ts src/lib/validations/onboarding.ts src/actions/onboarding.actions.ts "src/app/onboarding/page.tsx" src/app/layout.tsx src/lib/constants/appearance.ts`
Expected: no errors.

- [ ] **Step 17: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass, one fewer than before (the removed `updateAccentColor` test).

- [ ] **Step 18: Commit**

```bash
git add prisma/schema.prisma src/lib/settings.ts src/lib/settings.test.ts src/lib/validations/settings.ts src/actions/settings.actions.ts src/lib/onboarding.ts src/lib/onboarding.test.ts src/lib/validations/onboarding.ts src/actions/onboarding.actions.ts "src/app/onboarding/page.tsx" src/app/layout.tsx src/lib/constants/appearance.ts
git commit -m "chore: remove the unused accent-color picker plumbing

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Replace the theme tokens in `globals.css`

**Files:**
- Modify: `src/app/globals.css`

No test file — this is pure CSS; verification is manual (Task 4).

- [ ] **Step 1: Replace the `@theme inline` block's sidebar/chart mappings and add the typography scale**

Replace the existing `@theme inline { ... }` block with:

```css
@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --font-sans: var(--font-manrope);
  --font-heading: var(--font-manrope);
  --color-card-secondary: var(--card-secondary);
  --color-panel-soft: var(--panel-soft);
  --color-success: var(--success);
  --color-success-background: var(--success-background);
  --color-warning: var(--warning);
  --color-danger: var(--danger);
  --color-info: var(--info);
  --color-sidebar-ring: var(--sidebar-ring);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar: var(--sidebar);
  --color-chart-5: var(--chart-5);
  --color-chart-4: var(--chart-4);
  --color-chart-3: var(--chart-3);
  --color-chart-2: var(--chart-2);
  --color-chart-1: var(--chart-1);
  --color-ring: var(--ring);
  --color-input: var(--input);
  --color-border: var(--border);
  --color-destructive: var(--destructive);
  --color-accent-foreground: var(--accent-foreground);
  --color-accent: var(--accent);
  --color-muted-foreground: var(--muted-foreground);
  --color-muted: var(--muted);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-secondary: var(--secondary);
  --color-primary-foreground: var(--primary-foreground);
  --color-primary: var(--primary);
  --color-popover-foreground: var(--popover-foreground);
  --color-popover: var(--popover);
  --color-card-foreground: var(--card-foreground);
  --color-card: var(--card);
  --radius-sm: calc(var(--radius) * 0.6);
  --radius-md: calc(var(--radius) * 0.8);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) * 1.4);
  --radius-2xl: calc(var(--radius) * 1.8);
  --radius-3xl: calc(var(--radius) * 2.2);
  --radius-4xl: calc(var(--radius) * 2.6);
  --text-2xs: 0.75rem;   /* 12px */
  --text-2xs--line-height: 1rem;
  --text-xs: 0.8125rem;  /* 13px */
  --text-xs--line-height: 1.125rem;
  --text-sm: 0.875rem;   /* 14px */
  --text-sm--line-height: 1.25rem;
  --text-base: 1rem;     /* 16px — mobile input floor */
  --text-base--line-height: 1.5rem;
  --text-md: 0.9375rem;  /* 15px — card titles, between sm and lg */
  --text-md--line-height: 1.375rem;
  --text-lg: 1.125rem;   /* 18px — section headers */
  --text-lg--line-height: 1.625rem;
  --text-xl: 1.5rem;     /* 24px — page titles */
  --text-xl--line-height: 1.875rem;
  --text-2xl: 1.75rem;   /* 28px — major financial totals */
  --text-2xl--line-height: 2.125rem;
}
```

- [ ] **Step 2: Replace `:root` (light mode)**

```css
:root {
  --background: #FFF7F8;
  --foreground: #2C1720;
  --card: #FFFFFF;
  --card-foreground: #2C1720;
  --card-secondary: #FFFDFE;
  --panel-soft: #FBEAF0;
  --popover: #FFFFFF;
  --popover-foreground: #2C1720;
  --primary: #6F1D3A;
  --primary-foreground: #FFFFFF; /* 8.9:1 against #6F1D3A */
  --secondary: #FBEAF0;
  --secondary-foreground: #2C1720;
  --muted: #FBEAF0;
  --muted-foreground: #78636C;
  --accent: #F2C7D4;
  --accent-foreground: #2C1720;
  --destructive: #B42335;
  --border: #E8D3DB;
  --input: #E8D3DB;
  --ring: #6F1D3A;
  --success: #2F7D5B;
  --success-background: #E5F4EC;
  --warning: #B86A2D;
  --danger: #B42335;
  --info: #657188;
  --chart-1: #963956; /* berry */
  --chart-2: #C94F70; /* rose-red */
  --chart-3: #B86A2D; /* warm amber-neutral, not green */
  --chart-4: #657188; /* informational slate */
  --chart-5: #54132B; /* dark wine */
  --radius: 0.625rem;
  --sidebar: #54132B;
  --sidebar-foreground: #FFF7F8;
  --sidebar-primary: #6F1D3A;
  --sidebar-primary-foreground: #FFFFFF;
  --sidebar-accent: #963956;
  --sidebar-accent-foreground: #FFFFFF;
  --sidebar-border: #E8D3DB;
  --sidebar-ring: #6F1D3A;

  --nav-background: #54132B;
  --nav-foreground: #FFF7F8;
  --accent-tint: #FBEAF0;
}
```

- [ ] **Step 3: Replace `.dark`**

```css
.dark {
  --background: #150C12;
  --foreground: #FFF2F6;
  --card: #24131B;
  --card-foreground: #FFF2F6;
  --card-secondary: #301A24;
  --panel-soft: #3A1D2A;
  --popover: #24131B;
  --popover-foreground: #FFF2F6;
  --primary: #D76A8D;
  --primary-foreground: #150C12; /* dark text on the lighter dark-mode rose */
  --secondary: #301A24;
  --secondary-foreground: #FFF2F6;
  --muted: #301A24;
  --muted-foreground: #C6AAB5;
  --accent: #3A1D2A;
  --accent-foreground: #FFF2F6;
  --destructive: #FF6B78;
  --border: #4C2937;
  --input: #1E1017;
  --ring: #D76A8D;
  --success: #65C99A;
  --success-background: #173D2E;
  --warning: #E1A05B;
  --danger: #FF6B78;
  --info: #98A5BA;
  --chart-1: #F08AAA;
  --chart-2: #D76A8D;
  --chart-3: #E1A05B;
  --chart-4: #98A5BA;
  --chart-5: #963956;
  --sidebar: #2B101C;
  --sidebar-foreground: #FFF2F6;
  --sidebar-primary: #D76A8D;
  --sidebar-primary-foreground: #150C12;
  --sidebar-accent: #3A1D2A;
  --sidebar-accent-foreground: #FFF2F6;
  --sidebar-border: #4C2937;
  --sidebar-ring: #D76A8D;

  --nav-background: #2B101C;
  --nav-foreground: #FFF2F6;
  --accent-tint: #3A1D2A;
}
```

- [ ] **Step 4: Remove every `[data-accent="*"]` block**

Delete the entire section from `/* Per-user accent — ... */` through the last `.dark[data-accent="wine"] { ... }` line (both the light-mode `[data-accent="..."]` blocks and the `.dark[data-accent="..."]` overrides) — there is exactly one identity now, defined by `:root`/`.dark` above, so no per-accent overrides are needed.

- [ ] **Step 5: Verify Tailwind's built-in text-size utilities aren't silently shadowed**

Run: `Grep -rn "text-2xs\|text-md\b" src --include="*.tsx"` (expect no matches yet — these are new tokens, not used anywhere until Task 3/later phases wire them into components). This step just confirms the token names don't collide with anything already in use under a different meaning.

- [ ] **Step 6: Typecheck, lint, and build**

Run: `npx tsc --noEmit && npx eslint . && npx next build`
Expected: no errors (CSS changes don't affect TypeScript, but this confirms nothing else broke).

- [ ] **Step 7: Commit**

```bash
git add src/app/globals.css
git commit -m "feat(design): replace the accent-picker token system with a fixed Wine palette and semantic status tokens

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Fix the three components that hardcode green/amber instead of a semantic token

**Files:**
- Modify: `src/components/quick-capture/quick-capture-panel.tsx`
- Modify: `src/components/transactions/transaction-list.tsx`

- [ ] **Step 1: Quick Capture's clarification question — amber literal to `text-warning`**

In `quick-capture-panel.tsx`, change:

```tsx
<p className="mb-2 text-amber-600">{entry.draft.clarification.question}</p>
```

to:

```tsx
<p className="mb-2 text-warning">{entry.draft.clarification.question}</p>
```

- [ ] **Step 2: Quick Capture's "Added ✓" — emerald literal to `text-success`**

This is a genuine, explicit success state (a successfully saved command) — the request's own list ("Successfully saved") names this exact case. Change:

```tsx
<div className="flex items-center gap-2 text-emerald-700">
```

to:

```tsx
<div className="flex items-center gap-2 text-success">
```

- [ ] **Step 3: Transaction list's positive-amount color — remove green, it's not a success state**

A positive transaction amount is plain data (an inflow), not a completed/successful state — using green here is exactly the "general accent"/"decorative" misuse the new rules forbid. In `transaction-list.tsx`, change:

```tsx
<span className={txn.amount < 0 ? "text-destructive" : "text-emerald-600"}>
```

to:

```tsx
<span className={txn.amount < 0 ? "text-destructive" : "text-foreground"}>
```

(Plain foreground text for an inflow, `text-destructive` kept for an outflow — direction is already conveyed by the sign and, per the design doc's "pair color with an icon, don't rely on color alone" principle, a later phase may add a small inflow/outflow icon here; not required for this token-replacement phase.)

- [ ] **Step 4: Typecheck and lint**

Run: `npx tsc --noEmit && npx eslint src/components/quick-capture/quick-capture-panel.tsx src/components/transactions/transaction-list.tsx`
Expected: no errors.

- [ ] **Step 5: Run the full test suite**

Run: `npx vitest run`
Expected: all tests still pass (these are presentational-only changes with no test coverage, consistent with this codebase's convention — confirming the rest of the suite is unaffected).

- [ ] **Step 6: Commit**

```bash
git add src/components/quick-capture/quick-capture-panel.tsx src/components/transactions/transaction-list.tsx
git commit -m "fix(design): stop using green for non-success states

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Full verification and deploy

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass (one fewer than the pre-phase count, per Task 1's removed test).

- [ ] **Step 2: Typecheck, lint, and build the whole project**

Run: `npx tsc --noEmit && npx eslint . && npx next build`
Expected: no errors, successful build.

- [ ] **Step 3: Push to trigger a Vercel deploy**

```bash
git push
```

- [ ] **Step 4: Manually verify on the live deployment**

- Log in as the demo account. Confirm the whole app now renders in the Wine palette (wine sidebar/nav, blush/rose accents) in light mode, and the dark-mode palette when toggled, with no leftover green anywhere except: the Quick Capture "Added ✓" confirmation (should now be the new muted success green, not the old bright emerald), and nowhere else.
- Confirm Settings no longer shows (and never did show) an accent-color picker, and that the theme-mode picker still works in all three modes, including a real device-theme change while in System mode.
- Confirm the Reports page's two charts render with the new berry/rose data colors, no green bars.
- Confirm a positive (income) row in Transactions no longer renders in green.
- Confirm onboarding still completes successfully for a fresh signup (no accent-color field breaks the flow).

- [ ] **Step 5: Report results to the user**

Summarize: tests passing (count), build clean, live verification outcomes, and that this completes Phase 20.1 — hand off to `finishing-a-development-branch`, then note Phase 20.2 (shared `Card`/`IconBadge` components) is next per the roadmap.
