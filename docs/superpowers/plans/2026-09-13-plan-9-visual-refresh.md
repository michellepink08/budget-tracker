# Visual Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the warm cream/deep-green/coral brand and Geist Sans with a near-black/white palette, Manrope typography everywhere, and a tonal (dark/base/light) accent system where the nav bar, buttons/progress fill, and progress-bar track backgrounds all derive from one chosen accent color.

**Architecture:** A full rewrite of `src/app/globals.css`'s color tokens and per-accent blocks, a font swap in `src/app/layout.tsx`, an updated single-source-of-truth accent list in `src/lib/constants/appearance.ts`, and three small hardcoded-default fixes (`"coral"` → `"emerald"`) that don't derive from that constants file today.

**Tech Stack:** Manrope via `next/font/google` (replacing Geist), existing Tailwind v4 `@theme inline` token system — no new dependencies.

---

### Task 1: Swap Geist Sans for Manrope

**Files:**
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Replace the font imports and variable setup**

Replace:
```tsx
import { Geist, Geist_Mono } from "next/font/google";
```
with:
```tsx
import { Manrope } from "next/font/google";
```

Replace:
```tsx
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});
```
with:
```tsx
const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  weight: ["500", "700", "800"],
});
```

- [ ] **Step 2: Update the `<html>` className and the `data-accent` fallback**

Replace:
```tsx
      data-accent={user?.accentColor ?? "coral"}
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
```
with:
```tsx
      data-accent={user?.accentColor ?? "emerald"}
      suppressHydrationWarning
      className={`${manrope.variable} h-full antialiased`}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/layout.tsx
git commit -m "feat: switch typography from Geist Sans to Manrope

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Rewrite the color palette and tonal accent system

**Files:**
- Modify: `src/app/globals.css`

- [ ] **Step 1: Update the `@theme inline` block's font variables and add `--accent-tint`**

Replace:
```css
  --font-sans: var(--font-sans);
  --font-mono: var(--font-geist-mono);
  --font-heading: var(--font-sans);
```
with:
```css
  --font-sans: var(--font-manrope);
  --font-heading: var(--font-manrope);
  --color-accent-tint: var(--accent-tint);
```

(`--font-mono` is dropped — nothing in this codebase renders monospace text. `--color-accent-tint` is added alongside the other `--color-*` theme entries so `bg-accent-tint` becomes a usable Tailwind utility, the same way `--color-primary` already makes `bg-primary` available.)

- [ ] **Step 2: Replace the `:root` block's palette**

Replace:
```css
:root {
  --background: #faf3e8;
  --foreground: #2b241c;
  --card: #ffffff;
  --card-foreground: #2b241c;
  --popover: #ffffff;
  --popover-foreground: #2b241c;
  --primary: #ff6b5e;
  --primary-foreground: #ffffff;
  --secondary: #efe6d8;
  --secondary-foreground: #3f3a32;
  --muted: #f1e9da;
  --muted-foreground: #7a7266;
  --accent: #e7e1cf;
  --accent-foreground: #2b241c;
  --destructive: oklch(0.577 0.245 27.325);
  --border: #e4dac5;
  --input: #e4dac5;
  --ring: #ff6b5e;
  --chart-1: #ff6b5e;
  --chart-2: #6b8f71;
  --chart-3: #e3a857;
  --chart-4: #c97b63;
  --chart-5: #a69b87;
  --radius: 0.625rem;
  --sidebar: #f1e9da;
  --sidebar-foreground: #2b241c;
  --sidebar-primary: #ff6b5e;
  --sidebar-primary-foreground: #ffffff;
  --sidebar-accent: #e7e1cf;
  --sidebar-accent-foreground: #2b241c;
  --sidebar-border: #e4dac5;
  --sidebar-ring: #ff6b5e;

  /* Brand chrome — the nav bar and major section headers. Fixed; does not
     change with the user's accent color (design spec's "Visual identity"). */
  --nav-background: #2f4a3e;
  --nav-foreground: #f5f1e8;
}
```
with:
```css
:root {
  --background: #fafafa;
  --foreground: #0a0a0a;
  --card: #ffffff;
  --card-foreground: #0a0a0a;
  --popover: #ffffff;
  --popover-foreground: #0a0a0a;
  --primary: #059669;
  --primary-foreground: #0a0a0a; /* white failed WCAG AA here (3.77:1) — dark text clears it (5.25:1) */
  --secondary: #f0f0f0;
  --secondary-foreground: #262626;
  --muted: #f0f0f0;
  --muted-foreground: #737373;
  --accent: #e5e5e5;
  --accent-foreground: #0a0a0a;
  --destructive: oklch(0.577 0.245 27.325);
  --border: #e5e5e5;
  --input: #e5e5e5;
  --ring: #059669;
  --chart-1: #be123c;
  --chart-2: #059669;
  --chart-3: #b45309;
  --chart-4: #3730a3;
  --chart-5: #0d9488;
  --radius: 0.625rem;
  --sidebar: #f0f0f0;
  --sidebar-foreground: #0a0a0a;
  --sidebar-primary: #059669;
  --sidebar-primary-foreground: #0a0a0a;
  --sidebar-accent: #e5e5e5;
  --sidebar-accent-foreground: #0a0a0a;
  --sidebar-border: #e5e5e5;
  --sidebar-ring: #059669;

  /* Nav bar and progress-bar track background — both now derive from the
     user's chosen accent (dark and light tonal shades respectively). These
     are the accent-less defaults (Emerald), overridden per accent below. */
  --nav-background: #065f46;
  --nav-foreground: #fafafa;
  --accent-tint: #d1fae5;
}
```

- [ ] **Step 3: Replace the `.dark` block's palette**

Replace:
```css
.dark {
  --background: #201c16;
  --foreground: #f0e9da;
  --card: #2a251d;
  --card-foreground: #f0e9da;
  --popover: #2a251d;
  --popover-foreground: #f0e9da;
  --primary: #ff6b5e;
  --primary-foreground: #ffffff;
  --secondary: #362f26;
  --secondary-foreground: #f0e9da;
  --muted: #362f26;
  --muted-foreground: #a79c8a;
  --accent: #3a3226;
  --accent-foreground: #f0e9da;
  --destructive: oklch(0.704 0.191 22.216);
  --border: #423a2e;
  --input: #423a2e;
  --ring: #ff6b5e;
  --chart-1: #ff6b5e;
  --chart-2: #6b8f71;
  --chart-3: #e3a857;
  --chart-4: #c97b63;
  --chart-5: #a69b87;
  --sidebar: #2a251d;
  --sidebar-foreground: #f0e9da;
  --sidebar-primary: #ff6b5e;
  --sidebar-primary-foreground: #ffffff;
  --sidebar-accent: #3a3226;
  --sidebar-accent-foreground: #f0e9da;
  --sidebar-border: #423a2e;
  --sidebar-ring: #ff6b5e;

  --nav-background: #1d2e25;
  --nav-foreground: #f0e9da;
}
```
with:
```css
.dark {
  --background: #0a0a0a;
  --foreground: #fafafa;
  --card: #171717;
  --card-foreground: #fafafa;
  --popover: #171717;
  --popover-foreground: #fafafa;
  --primary: #059669;
  --primary-foreground: #0a0a0a;
  --secondary: #262626;
  --secondary-foreground: #fafafa;
  --muted: #262626;
  --muted-foreground: #a3a3a3;
  --accent: #262626;
  --accent-foreground: #fafafa;
  --destructive: oklch(0.704 0.191 22.216);
  --border: #2e2e2e;
  --input: #2e2e2e;
  --ring: #059669;
  --chart-1: #be123c;
  --chart-2: #059669;
  --chart-3: #b45309;
  --chart-4: #3730a3;
  --chart-5: #0d9488;
  --sidebar: #171717;
  --sidebar-foreground: #fafafa;
  --sidebar-primary: #059669;
  --sidebar-primary-foreground: #0a0a0a;
  --sidebar-accent: #262626;
  --sidebar-accent-foreground: #fafafa;
  --sidebar-border: #2e2e2e;
  --sidebar-ring: #059669;

  --nav-background: #065f46;
  --nav-foreground: #fafafa;
  --accent-tint: #0f2e22;
}
```

(Dark mode's `--accent-tint` is a dark-tinted background, not the light-mode swatch — it needs to stay visually recessive against the dark page background. Each accent's dark-mode tint override is specified per-accent in Step 4.)

- [ ] **Step 4: Replace the six `[data-accent="..."]` blocks**

Replace the entire block from `/* Per-user accent ... */` through the closing `}` of `[data-accent="neutral"]` with:

```css
/* Per-user accent — three tonal shades derived from one chosen color:
   --nav-background/--nav-foreground (dark shade, nav bar), --primary/
   --primary-foreground/--ring (base shade, buttons/active states/on-track
   progress fill), --accent-tint (light shade, progress-bar track
   background). Every --primary-foreground pairing is computed and
   verified against WCAG AA (4.5:1) — see comments below for any that
   needed dark text instead of white. */
[data-accent="emerald"] {
  --nav-background: #065f46;
  --nav-foreground: #fafafa;
  --primary: #059669;
  --primary-foreground: #0a0a0a; /* white failed AA (3.77:1) — dark text clears it (5.25:1) */
  --ring: #059669;
  --accent-tint: #d1fae5;
}
[data-accent="teal"] {
  --nav-background: #134e4a;
  --nav-foreground: #fafafa;
  --primary: #0d9488;
  --primary-foreground: #0a0a0a; /* white failed AA (3.74:1) — dark text clears it (5.29:1) */
  --ring: #0d9488;
  --accent-tint: #ccfbf1;
}
[data-accent="amber"] {
  --nav-background: #78350f;
  --nav-foreground: #fafafa;
  --primary: #b45309;
  --primary-foreground: #ffffff; /* 5.02:1 */
  --ring: #b45309;
  --accent-tint: #fef3c7;
}
[data-accent="indigo"] {
  --nav-background: #312e81;
  --nav-foreground: #fafafa;
  --primary: #3730a3;
  --primary-foreground: #ffffff; /* 9.93:1 */
  --ring: #3730a3;
  --accent-tint: #e0e7ff;
}
[data-accent="rose"] {
  --nav-background: #881337;
  --nav-foreground: #fafafa;
  --primary: #be123c;
  --primary-foreground: #ffffff; /* 6.29:1 */
  --ring: #be123c;
  --accent-tint: #ffe4e6;
}
[data-accent="stone"] {
  --nav-background: #292524;
  --nav-foreground: #fafafa;
  --primary: #44403c;
  --primary-foreground: #ffffff; /* 10.27:1 */
  --ring: #44403c;
  --accent-tint: #e7e5e4;
}

/* Dark mode gets its own --accent-tint per accent (a dark-tinted
   background stays visually recessive against the dark page background;
   the light-mode tint above would look like a bright highlight instead). */
.dark[data-accent="emerald"] { --accent-tint: #0f2e22; }
.dark[data-accent="teal"] { --accent-tint: #0d2e2b; }
.dark[data-accent="amber"] { --accent-tint: #2e1a06; }
.dark[data-accent="indigo"] { --accent-tint: #1e1c4a; }
.dark[data-accent="rose"] { --accent-tint: #3a0a17; }
.dark[data-accent="stone"] { --accent-tint: #262421; }
```

- [ ] **Step 5: Commit**

```bash
git add src/app/globals.css
git commit -m "feat: rewrite palette to near-black/white with tonal per-accent shades

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Update the accent color presets list

**Files:**
- Modify: `src/lib/constants/appearance.ts`

- [ ] **Step 1: Replace `ACCENT_COLORS`**

Replace:
```typescript
// Single source of truth for the accent-color preset list (first offered
// at onboarding, reused by Settings) and the theme-mode value set. Every
// preset here must meet contrast requirements against the cream/green
// base chrome (design spec's "Visual identity" section) before adding a
// new one.
export const ACCENT_COLORS = [
  { value: "coral", label: "Coral", swatch: "#ff6b5e" },
  { value: "blue", label: "Blue", swatch: "#2563eb" },
  { value: "green", label: "Green", swatch: "#15803d" },
  { value: "purple", label: "Purple", swatch: "#7c3aed" },
  { value: "neutral", label: "Neutral", swatch: "#52525b" },
] as const;
```
with:
```typescript
// Single source of truth for the accent-color preset list (first offered
// at onboarding, reused by Settings) and the theme-mode value set. Each
// value here must have a matching [data-accent="..."] block in
// globals.css defining its three tonal shades (nav/primary/tint), all
// verified against WCAG AA (4.5:1) before adding a new one.
export const ACCENT_COLORS = [
  { value: "emerald", label: "Emerald", swatch: "#059669" },
  { value: "teal", label: "Teal", swatch: "#0d9488" },
  { value: "amber", label: "Amber", swatch: "#b45309" },
  { value: "indigo", label: "Indigo", swatch: "#3730a3" },
  { value: "rose", label: "Rose", swatch: "#be123c" },
  { value: "stone", label: "Stone", swatch: "#44403c" },
] as const;
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/constants/appearance.ts
git commit -m "feat: replace accent color presets with the new tonal palette

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Fix the two other hardcoded `"coral"` defaults

**Files:**
- Modify: `src/app/onboarding/page.tsx`
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Update the onboarding form's default value**

Find:
```tsx
    defaultValues: { cycleStartDay: 1, currency: "PHP", accentColor: "coral" },
```
Replace with:
```tsx
    defaultValues: { cycleStartDay: 1, currency: "PHP", accentColor: "emerald" },
```

- [ ] **Step 2: Update the Prisma schema default**

In `prisma/schema.prisma`, find:
```prisma
  accentColor   String   @default("coral")
```
Replace with:
```prisma
  accentColor   String   @default("emerald")
```

(This only affects rows created from now on — no data migration for existing rows; see the design spec's "Migration of existing stored accent values" for why that's an acceptable tradeoff here.)

- [ ] **Step 3: Regenerate the Prisma client**

Run: `npx prisma generate`
Expected: succeeds (schema-only change, no reachable database needed).

- [ ] **Step 4: Commit**

```bash
git add "src/app/onboarding/page.tsx" prisma/schema.prisma
git commit -m "fix: update the two remaining hardcoded accent defaults to emerald

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Budget progress bars use the accent tint, and turn red over budget

**Files:**
- Modify: `src/components/budget/allocation-list.tsx`

- [ ] **Step 1: Write the failing behavior first — check the current file has no over-budget color logic**

Read `src/components/budget/allocation-list.tsx` and confirm the progress bar fill is unconditionally `bg-primary` regardless of whether the allocation is over budget (only the text label below it changes wording). This is a real gap versus the design spec's mockup (which showed the bar itself turning red over budget) — this task both re-tints the track background *and* adds that missing red-when-over-budget behavior, since the user approved a mockup showing both.

- [ ] **Step 2: Update the track and fill classes**

Find:
```tsx
            <div className="mt-2 h-2 rounded-full bg-muted">
              <div
                className="h-2 rounded-full bg-primary"
                style={{ width: `${pct}%` }}
              />
            </div>
```
Replace with:
```tsx
            <div className="mt-2 h-2 rounded-full bg-accent-tint">
              <div
                className={
                  allocation.remaining < 0
                    ? "h-2 rounded-full bg-destructive"
                    : "h-2 rounded-full bg-primary"
                }
                style={{ width: `${pct}%` }}
              />
            </div>
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/components/budget/allocation-list.tsx
git commit -m "feat: budget progress bars use the accent tint and turn red over budget

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: Update tests that hardcode old accent values

**Files:**
- Modify: `src/lib/settings.test.ts`
- Modify: `src/lib/validations/settings.test.ts`
- Modify: `src/lib/validations/onboarding.test.ts`
- Modify: `src/lib/onboarding.test.ts`

- [ ] **Step 1: `src/lib/settings.test.ts`**

Replace both occurrences of `"blue"` (an arbitrary old valid value used as the test's example) with `"teal"` (an arbitrary new valid value):
```typescript
    await updateAccentColor(prisma, "user-1", "teal");
```
and
```typescript
      data: { accentColor: "teal" },
```

- [ ] **Step 2: `src/lib/validations/settings.test.ts`**

Find:
```typescript
    for (const value of ["coral", "blue", "green", "purple", "neutral"]) {
```
Replace with:
```typescript
    for (const value of ["emerald", "teal", "amber", "indigo", "rose", "stone"]) {
```

- [ ] **Step 3: `src/lib/validations/onboarding.test.ts`**

Replace every occurrence (4 total) of:
```typescript
      accentColor: "coral",
```
with:
```typescript
      accentColor: "emerald",
```

- [ ] **Step 4: `src/lib/onboarding.test.ts`**

Replace:
```typescript
      accentColor: "coral",
```
with:
```typescript
      accentColor: "emerald",
```
and:
```typescript
    expect(args.data.accentColor).toBe("coral");
```
with:
```typescript
    expect(args.data.accentColor).toBe("emerald");
```

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: PASS, all 225 tests.

- [ ] **Step 6: Commit**

```bash
git add src/lib/settings.test.ts src/lib/validations/settings.test.ts src/lib/validations/onboarding.test.ts src/lib/onboarding.test.ts
git commit -m "test: update accent color fixtures to the new palette values

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run everything**

Run: `npm test` — expected PASS, 225 tests.
Run: `npx tsc --noEmit` — expected clean.
Run: `npm run lint` — expected 0 errors (same 4 pre-existing informational warnings).
Run: `npm run build` — expected clean production build.

- [ ] **Step 2: Commit if anything needed fixing**

If any of the above required a fix, commit it now with an appropriate message before moving on.

---

### Task 8: Finish the branch and deploy

- [ ] **Step 1:** Follow superpowers:finishing-a-development-branch (tests/typecheck/lint/build already verified in Task 7; per standing user instruction, merge locally without presenting the options menu).

- [ ] **Step 2: Push to GitHub to trigger a live deploy**

```bash
git push origin master
```

- [ ] **Step 3: Manual verification against the live deployment**

Once Vercel shows the deploy "Ready," check on the real production URL:
1. Every page loads with the new near-black/white palette and Manrope typography (not the old cream/coral/Geist look).
2. In Settings, cycle through all six accent options (Emerald, Teal, Amber, Indigo, Rose, Stone) and confirm each one visibly changes: the nav bar color, the "+ Add" button color, and (on the Budget page) the progress bar fill and track color — all three together, not just one.
3. On the Budget page, confirm an over-allocated category's progress bar renders red (`--destructive`) instead of the accent color.
4. Toggle light/dark mode (Settings → Theme) with an accent selected, and confirm the palette swaps correctly in both modes without any leftover warm-cream colors.
5. Check the mobile bottom nav (resize to a mobile width) picks up the same accent-tinted nav-background as the desktop top nav.
6. Confirm the demo account's login page still works, and that the `/forgot-password` email flow (Plan 5/6 work) still functions — this change shouldn't have touched auth logic at all, but it's a cheap regression check given how much of the page shell changed visually.
