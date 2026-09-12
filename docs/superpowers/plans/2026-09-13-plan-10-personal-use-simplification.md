# Personal-Use Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hide the accent-color and currency pickers (onboarding + Settings), replacing them with a fixed new "Wine" accent and PHP currency — without deleting any of the underlying multi-user/customization infrastructure, which stays intact for possibly re-enabling later.

**Architecture:** One new CSS accent preset added alongside the existing six; three hardcoded-default swaps (`"emerald"` → `"wine"`); UI-layer-only removal of the picker JSX/handlers in onboarding and Settings, with every backend piece (schema, validation, server actions, CSS tokens) left untouched.

**Tech Stack:** No new dependencies — CSS custom properties, existing form components.

---

### Task 1: Add the Wine accent preset

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/lib/constants/appearance.ts`

- [ ] **Step 1: Add the `[data-accent="wine"]` CSS block**

In `src/app/globals.css`, after the closing `}` of `[data-accent="stone"]` (and before the `.dark[data-accent="emerald"] { ... }` line), add:

```css
[data-accent="wine"] {
  --nav-background: #4a0f26;
  --nav-foreground: #fafafa;
  --primary: #7c1d3f;
  --primary-foreground: #ffffff; /* 9.98:1 */
  --ring: #7c1d3f;
  --accent-tint: #eed4dc;
}
```

Add the matching dark-mode tint line alongside the other `.dark[data-accent="..."]` lines:

```css
.dark[data-accent="wine"] { --accent-tint: #2e0f18; }
```

- [ ] **Step 2: Add `wine` to the `ACCENT_COLORS` constant**

In `src/lib/constants/appearance.ts`, add a new entry to the array (order doesn't matter functionally, but appending keeps the diff clean):

```typescript
export const ACCENT_COLORS = [
  { value: "emerald", label: "Emerald", swatch: "#059669" },
  { value: "teal", label: "Teal", swatch: "#0d9488" },
  { value: "amber", label: "Amber", swatch: "#b45309" },
  { value: "indigo", label: "Indigo", swatch: "#3730a3" },
  { value: "rose", label: "Rose", swatch: "#be123c" },
  { value: "stone", label: "Stone", swatch: "#44403c" },
  { value: "wine", label: "Wine", swatch: "#7c1d3f" },
] as const;
```

(This constant still backs the now-hidden picker's underlying type/validation — adding `wine` here keeps it available the moment the picker UI returns, per this plan's "hidden, not deleted" approach.)

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean (0 errors).

- [ ] **Step 4: Commit**

```bash
git add src/app/globals.css src/lib/constants/appearance.ts
git commit -m "feat: add the Wine accent preset

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Make Wine the new default

**Files:**
- Modify: `src/app/layout.tsx`
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Update the root layout's fallback**

Find:
```tsx
      data-accent={user?.accentColor ?? "emerald"}
```
Replace with:
```tsx
      data-accent={user?.accentColor ?? "wine"}
```

- [ ] **Step 2: Update the Prisma schema default**

In `prisma/schema.prisma`, find:
```prisma
  accentColor   String   @default("emerald")
```
Replace with:
```prisma
  accentColor   String   @default("wine")
```

- [ ] **Step 3: Regenerate the Prisma client**

Run: `npx prisma generate`
Expected: succeeds (schema-only change).

- [ ] **Step 4: Commit**

```bash
git add src/app/layout.tsx prisma/schema.prisma
git commit -m "feat: make Wine the default accent

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Remove the pickers from onboarding

**Files:**
- Modify: `src/app/onboarding/page.tsx`

- [ ] **Step 1: Replace the whole file**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { onboardingSchema } from "@/lib/validations/onboarding";
import { completeOnboardingAction } from "@/actions/onboarding.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type OnboardingInput = z.infer<typeof onboardingSchema>;

export default function OnboardingPage() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<OnboardingInput>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: { cycleStartDay: 1, currency: "PHP", accentColor: "wine" },
  });

  async function onSubmit(values: OnboardingInput) {
    setServerError(null);
    const formData = new FormData();
    formData.set("cycleStartDay", String(values.cycleStartDay));
    formData.set("currency", values.currency);
    formData.set("accentColor", values.accentColor);
    const result = await completeOnboardingAction(formData);
    if (!result.ok) {
      setServerError(result.error);
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 px-4">
      <h1 className="text-xl font-semibold">Set up your budget</h1>
      <p className="text-sm text-muted-foreground">
        One thing before you get started. You can change this later in Settings.
      </p>
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cycleStartDay">Cycle start day</Label>
          <Input
            id="cycleStartDay"
            type="number"
            min={1}
            max={31}
            {...register("cycleStartDay", { valueAsNumber: true })}
          />
          <p className="text-xs text-muted-foreground">
            e.g. 25 means each budget cycle runs from the 25th to the 24th of the next month.
          </p>
          {errors.cycleStartDay && (
            <p className="text-sm text-destructive">{errors.cycleStartDay.message}</p>
          )}
        </div>

        {serverError && <p className="text-sm text-destructive">{serverError}</p>}
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving..." : "Continue"}
        </Button>
      </form>
    </div>
  );
}
```

(`currency` and `accentColor` are still submitted — hardcoded to `"PHP"`/`"wine"` via the form's `defaultValues`, unseen by the user — so `onboardingSchema`, `completeOnboardingAction`, and `completeOnboarding` all stay exactly as they are; nothing downstream of the form needed to change.)

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add "src/app/onboarding/page.tsx"
git commit -m "feat: simplify onboarding to just cycle start day

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Remove the accent picker from Settings

**Files:**
- Modify: `src/components/settings/appearance-settings.tsx`
- Modify: `src/app/(app)/settings/page.tsx`

- [ ] **Step 1: Replace `appearance-settings.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { updateThemeModeAction } from "@/actions/settings.actions";
import { THEME_MODES } from "@/lib/constants/appearance";
import { Label } from "@/components/ui/label";

export function AppearanceSettings({ initialThemeMode }: { initialThemeMode: string }) {
  const { setTheme } = useTheme();
  const [themeMode, setThemeMode] = useState(initialThemeMode);

  async function handleThemeChange(value: string) {
    setThemeMode(value);
    setTheme(value); // instant client-side switch, next-themes' own mechanism
    const result = await updateThemeModeAction(value);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Theme updated");
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Label>Theme</Label>
        <div className="flex gap-2">
          {THEME_MODES.map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => handleThemeChange(mode)}
              className={
                themeMode === mode
                  ? "rounded-md border-2 border-primary px-3 py-1.5 text-sm capitalize"
                  : "rounded-md border-2 border-transparent px-3 py-1.5 text-sm capitalize text-muted-foreground"
              }
            >
              {mode}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
```

(`updateAccentColorAction` in `src/actions/settings.actions.ts` and `updateAccentColor` in `src/lib/settings.ts` are untouched — only this component's use of them is removed.)

- [ ] **Step 2: Update the Settings page's call site**

In `src/app/(app)/settings/page.tsx`, find:
```tsx
        <AppearanceSettings initialAccentColor={user.accentColor} initialThemeMode={user.themeMode} />
```
Replace with:
```tsx
        <AppearanceSettings initialThemeMode={user.themeMode} />
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/components/settings/appearance-settings.tsx "src/app/(app)/settings/page.tsx"
git commit -m "feat: remove the accent color picker from Settings

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Update test fixtures for the new default

**Files:**
- Modify: `src/lib/onboarding.test.ts`
- Modify: `src/lib/validations/onboarding.test.ts`

- [ ] **Step 1: `src/lib/onboarding.test.ts`**

Replace:
```typescript
      accentColor: "emerald",
```
with:
```typescript
      accentColor: "wine",
```
and:
```typescript
    expect(args.data.accentColor).toBe("emerald");
```
with:
```typescript
    expect(args.data.accentColor).toBe("wine");
```

- [ ] **Step 2: `src/lib/validations/onboarding.test.ts`**

Replace every occurrence (4 total) of:
```typescript
      accentColor: "emerald",
```
with:
```typescript
      accentColor: "wine",
```

- [ ] **Step 3: Run the full test suite**

Run: `npm test`
Expected: PASS, all 225 tests.

- [ ] **Step 4: Commit**

```bash
git add src/lib/onboarding.test.ts src/lib/validations/onboarding.test.ts
git commit -m "test: update accent color fixtures to the new Wine default

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run everything**

Run: `npm test` — expected PASS, 225 tests.
Run: `npx tsc --noEmit` — expected clean.
Run: `npm run lint` — expected 0 errors (same 4 pre-existing informational warnings).
Run: `npm run build` — expected clean production build.

---

### Task 7: Finish the branch and deploy

- [ ] **Step 1:** Follow superpowers:finishing-a-development-branch (tests/typecheck/lint/build already verified in Task 6; per standing user instruction, merge locally without presenting the options menu).

- [ ] **Step 2: Push to GitHub to trigger a live deploy**

```bash
git push origin master
```

- [ ] **Step 3: Manual verification against the live deployment**

Once Vercel shows the deploy "Ready," check on the real production URL:
1. Settings no longer shows an accent color picker, but Theme (Light/Dark/System) still works.
2. Sign up a brand-new test account and confirm onboarding only asks for cycle start day — no currency or accent prompts — and the resulting account renders in Wine/PHP without further input.
3. Confirm the existing demo account (already onboarded before this change) still logs in and works normally — its previously-stored accent value is untouched by this change.
4. Delete the test account's data via a fresh demo-data-style check isn't needed here since it's a throwaway signup — just note it exists if cleanup is ever wanted.
