# Plan 3B.4a: Visual Identity & Theming Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The first half of Plan 3B.4 — implement the app's actual visual identity (warm cream background, deep muted-green nav chrome, coral default accent, sage/warm-neutral supporting tones) in `globals.css`, wire `next-themes` so `themeMode` (light/dark/system) really does something, and make each user's stored `accentColor` actually change the UI — plus a Settings page to control both. Split out from Plan 3B.4b (moving Categories/Recurring into Settings, finishing the nav) because this is a different kind of work — CSS/theming plumbing vs. information-architecture reshuffling — the same reasoning behind every other split in this project.

**What this plan found, and why it's needed:** Checking how theming currently works turned up that `globals.css` is still the unmodified stock shadcn scaffold (`--primary` is near-black grayscale) — the cream/green/coral identity described in the design spec was never implemented. The onboarding accent picker (built in Plan 1) stores `accentColor` on `User`, but nothing reads it back to change any color. `next-themes` is an existing, currently-unused dependency (already in `package.json`) — its `ThemeProvider` isn't mounted anywhere, so `themeMode` is inert too. This plan is that missing implementation, not a re-design — the palette, mechanism, and scope choices below are stated explicitly so they're easy to adjust later if the look isn't quite right.

**Architecture:**
- **Brand chrome** (cream background, green nav bar and section headers) is fixed — it does **not** change with the user's accent choice, per the design spec. It's implemented as plain CSS custom properties in `globals.css`, with a `.dark` variant (already wired for, via the pre-existing `@custom-variant dark (&:is(.dark *))` — nothing to add there, `next-themes`'s `attribute="class"` mode toggles exactly that class).
- **Per-user accent** is a small preset list (reusing and centralizing the same 5 presets already offered at onboarding: coral, blue, green, purple, neutral) implemented as `[data-accent="..."]` CSS blocks that override only `--primary`/`--primary-foreground`/`--ring` — never the brand chrome. The chosen preset is stamped as a `data-accent` attribute on `<html>` by the root layout (a Server Component reading the signed-in user's `accentColor`), so it's set before first paint — no flash, no client-side re-stamping needed except a `router.refresh()` after the user changes it in Settings.
- **Theme mode** uses `next-themes`'s standard pattern: a small `"use client"` wrapper around `ThemeProvider` (`attribute="class"`), mounted in the root layout with `defaultTheme` seeded from the signed-in user's stored `themeMode` (so a fresh device/browser honors their preference immediately, before any client-side localStorage exists). Changing it in Settings calls `next-themes`'s `setTheme()` for the instant UI change *and* a server action to persist `themeMode` on `User`, so the next fresh session still picks it up.
- **Documented simplifications:** each accent preset uses the same hex values in both light and dark mode (not separately re-tuned per theme) — kept simple rather than doubling the color-decision surface; this plan also gives the five `--chart-*` tokens (used by Plan 3B.3's Reports charts) brand-consistent hues instead of leaving them stock grayscale, since shipping brand colors everywhere else but the charts would look like an oversight, not a choice.

**Tech Stack:** No new dependencies — `next-themes` is already installed and unused.

**Read first:** `docs/superpowers/specs/2026-09-12-budget-tracker-design.md` ("Visual identity" section); `src/app/onboarding/page.tsx` (the existing `ACCENT_COLORS` list and accent-picker UI this plan centralizes and reuses); `src/app/layout.tsx` and `src/app/(app)/layout.tsx` (root and app-shell layouts this plan modifies); `src/app/globals.css` (current stock palette this plan replaces).

**Scope boundary — explicitly NOT in this plan:** moving Categories/Recurring into Settings, or finishing the nav to match the spec's exact final order (Plan 3B.4b); re-tuning chart colors or the accent presets differently per light/dark mode; adding new accent presets beyond the existing 5; any change to `next-themes`'s own persistence mechanism (still browser localStorage, same as any standard `next-themes` setup — the `User.themeMode` DB column is only the seed value for a fresh browser/device, not a replacement for it).

---

### Task 1: Centralize the accent-color and theme-mode constants

**Files:**
- Create: `src/lib/constants/appearance.ts`
- Modify: `src/app/onboarding/page.tsx`

- [ ] **Step 1: Create the shared constants file**

```typescript
// src/lib/constants/appearance.ts
// Single source of truth for the accent-color preset list (first offered
// at onboarding, reused by Settings) and the theme-mode value set. Every
// preset here must meet contrast requirements against the cream/green
// base chrome (design spec's "Visual identity" section) before adding a
// new one.
export const ACCENT_COLORS = [
  { value: "coral", label: "Coral", swatch: "#ff6b5e" },
  { value: "blue", label: "Blue", swatch: "#3b82f6" },
  { value: "green", label: "Green", swatch: "#16a34a" },
  { value: "purple", label: "Purple", swatch: "#8b5cf6" },
  { value: "neutral", label: "Neutral", swatch: "#71717a" },
] as const;
export type AccentColor = (typeof ACCENT_COLORS)[number]["value"];
export const ACCENT_COLOR_VALUES = ACCENT_COLORS.map((c) => c.value) as [AccentColor, ...AccentColor[]];

export const THEME_MODES = ["light", "dark", "system"] as const;
export type ThemeMode = (typeof THEME_MODES)[number];
```

- [ ] **Step 2: Point onboarding at the shared list instead of its own copy**

In `src/app/onboarding/page.tsx`, remove the local `ACCENT_COLORS` array:

```typescript
const ACCENT_COLORS = [
  { value: "coral", label: "Coral", swatch: "#ff6b5e" },
  { value: "blue", label: "Blue", swatch: "#3b82f6" },
  { value: "green", label: "Green", swatch: "#16a34a" },
  { value: "purple", label: "Purple", swatch: "#8b5cf6" },
  { value: "neutral", label: "Neutral", swatch: "#71717a" },
];
```

and instead import it:

```typescript
import { ACCENT_COLORS } from "@/lib/constants/appearance";
```

placed with the other imports at the top of the file.

- [ ] **Step 3: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Manually confirm onboarding still works**

Not worth a full browser pass for a pure refactor — just re-read `src/app/onboarding/page.tsx` after the edit and confirm `ACCENT_COLORS` is used exactly as before (same shape: `value`/`label`/`swatch`).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: centralize accent-color and theme-mode constants"
```

---

### Task 2: Validation schemas

**Files:**
- Create: `src/lib/validations/settings.ts`
- Test: `src/lib/validations/settings.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/validations/settings.test.ts
import { describe, expect, it } from "vitest";
import { accentColorSchema, themeModeSchema } from "@/lib/validations/settings";

describe("accentColorSchema", () => {
  it("accepts every known preset", () => {
    for (const value of ["coral", "blue", "green", "purple", "neutral"]) {
      expect(accentColorSchema.safeParse({ accentColor: value }).success).toBe(true);
    }
  });

  it("rejects an unknown accent color", () => {
    const result = accentColorSchema.safeParse({ accentColor: "chartreuse" });
    expect(result.success).toBe(false);
  });
});

describe("themeModeSchema", () => {
  it("accepts light, dark, and system", () => {
    for (const value of ["light", "dark", "system"]) {
      expect(themeModeSchema.safeParse({ themeMode: value }).success).toBe(true);
    }
  });

  it("rejects an unknown theme mode", () => {
    const result = themeModeSchema.safeParse({ themeMode: "midnight" });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/lib/validations/settings.test.ts
```

Expected: FAIL — `src/lib/validations/settings.ts` does not exist yet.

- [ ] **Step 3: Implement**

```typescript
// src/lib/validations/settings.ts
import { z } from "zod";
import { ACCENT_COLOR_VALUES, THEME_MODES } from "@/lib/constants/appearance";

export const accentColorSchema = z.object({
  accentColor: z.enum(ACCENT_COLOR_VALUES),
});

export const themeModeSchema = z.object({
  themeMode: z.enum(THEME_MODES),
});
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/lib/validations/settings.test.ts
```

Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add accent color and theme mode validation schemas"
```

---

### Task 3: Domain — `src/lib/settings.ts`

**Files:**
- Create: `src/lib/settings.ts`
- Test: `src/lib/settings.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/settings.test.ts
import { describe, expect, it, vi } from "vitest";
import { updateAccentColor, updateThemeMode } from "@/lib/settings";

function makeFakePrisma() {
  return {
    user: {
      update: vi.fn().mockResolvedValue({}),
    },
  } as any;
}

describe("updateAccentColor", () => {
  it("updates the user's stored accentColor", async () => {
    const prisma = makeFakePrisma();

    await updateAccentColor(prisma, "user-1", "blue");

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { accentColor: "blue" },
    });
  });
});

describe("updateThemeMode", () => {
  it("updates the user's stored themeMode", async () => {
    const prisma = makeFakePrisma();

    await updateThemeMode(prisma, "user-1", "dark");

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { themeMode: "dark" },
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/lib/settings.test.ts
```

Expected: FAIL — `src/lib/settings.ts` does not exist yet.

- [ ] **Step 3: Implement**

```typescript
// src/lib/settings.ts
import type { PrismaClient } from "@prisma/client";

export async function updateAccentColor(
  prisma: Pick<PrismaClient, "user">,
  userId: string,
  accentColor: string,
): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { accentColor } });
}

export async function updateThemeMode(
  prisma: Pick<PrismaClient, "user">,
  userId: string,
  themeMode: string,
): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { themeMode } });
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/lib/settings.test.ts
```

Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add updateAccentColor and updateThemeMode domain functions"
```

---

### Task 4: Server actions

**Files:**
- Create: `src/actions/settings.actions.ts`

- [ ] **Step 1: Implement**

```typescript
// src/actions/settings.actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { accentColorSchema, themeModeSchema } from "@/lib/validations/settings";
import { updateAccentColor, updateThemeMode } from "@/lib/settings";

export type SettingsActionResult = { ok: true } | { ok: false; error: string };

export async function updateAccentColorAction(accentColor: string): Promise<SettingsActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const parsed = accentColorSchema.safeParse({ accentColor });
  if (!parsed.success) return { ok: false, error: "Unknown accent color" };

  await updateAccentColor(prisma, session.user.id, parsed.data.accentColor);

  // Revalidates the whole route tree, including the root layout, which is
  // where the accent is stamped onto <html> — a page-level revalidatePath
  // wouldn't reach it.
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function updateThemeModeAction(themeMode: string): Promise<SettingsActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const parsed = themeModeSchema.safeParse({ themeMode });
  if (!parsed.success) return { ok: false, error: "Unknown theme mode" };

  await updateThemeMode(prisma, session.user.id, parsed.data.themeMode);

  revalidatePath("/", "layout");
  return { ok: true };
}
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: add server actions for accent color and theme mode"
```

---

### Task 5: The brand palette in `globals.css`

**Files:**
- Modify: `src/app/globals.css`

- [ ] **Step 1: Replace the `:root` block**

Find the existing `:root { ... }` block (the stock shadcn grayscale palette) and replace it with:

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

(Leave `--destructive` as the pre-existing `oklch(...)` red — no brand reason to change it. Check what other keys the existing `:root` block has beyond what's listed above — e.g. any `--font-*` entries — and keep those unchanged; only the color values are being replaced.)

- [ ] **Step 2: Replace the `.dark` block**

Find the existing `.dark { ... }` block and replace it with:

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

(Again, check the existing `.dark` block for any non-color keys and preserve them; keep whatever `--destructive` value the stock dark block already had if it differs from the placeholder above, or use the one shown — either is a reasonable red for a destructive action.)

- [ ] **Step 3: Add the accent-color preset overrides**

Append, after the `.dark` block:

```css
/* Per-user accent — overrides only --primary/--primary-foreground/--ring.
   Never the brand chrome (--background, --nav-background, etc.) above.
   Same hex values in light and dark mode — see this plan's "Documented
   simplifications". */
[data-accent="coral"] {
  --primary: #ff6b5e;
  --primary-foreground: #ffffff;
  --ring: #ff6b5e;
}
[data-accent="blue"] {
  --primary: #3b82f6;
  --primary-foreground: #ffffff;
  --ring: #3b82f6;
}
[data-accent="green"] {
  --primary: #16a34a;
  --primary-foreground: #ffffff;
  --ring: #16a34a;
}
[data-accent="purple"] {
  --primary: #8b5cf6;
  --primary-foreground: #ffffff;
  --ring: #8b5cf6;
}
[data-accent="neutral"] {
  --primary: #52525b;
  --primary-foreground: #ffffff;
  --ring: #52525b;
}
```

- [ ] **Step 4: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no errors (this task only touches CSS, but confirming nothing else broke).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: implement the cream/green/coral brand palette with light and dark variants"
```

---

### Task 6: Wire `next-themes` and the accent attribute into the root layout; brand the top nav

**Files:**
- Create: `src/components/theme-provider.tsx`
- Modify: `src/app/layout.tsx`, `src/components/nav/top-nav.tsx`

- [ ] **Step 1: Create the client wrapper `next-themes` needs**

```typescript
// src/components/theme-provider.tsx
"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ComponentProps } from "react";

export function ThemeProvider({ children, ...props }: ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
```

- [ ] **Step 2: Update the root layout**

Replace `src/app/layout.tsx` with:

```typescript
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SessionProvider } from "next-auth/react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { APP_NAME } from "@/lib/config";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: APP_NAME,
  description: "Personal budget tracker",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const session = await auth();
  const user = session?.user
    ? await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { accentColor: true, themeMode: true },
      })
    : null;

  return (
    <html
      lang="en"
      data-accent={user?.accentColor ?? "coral"}
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider attribute="class" defaultTheme={user?.themeMode ?? "system"} enableSystem>
          <SessionProvider>{children}</SessionProvider>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
```

(`suppressHydrationWarning` on `<html>` is required by `next-themes` — it injects the `class` attribute via an inline script before hydration, which would otherwise log a mismatch warning.)

- [ ] **Step 3: Brand the top nav's chrome and add an active-link indicator**

`TopNav` needs to know the current route to underline the active link in the accent color, which means it needs `usePathname` — replace `src/components/nav/top-nav.tsx` with:

```typescript
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wallet } from "lucide-react";
import { SignOutButton } from "@/components/nav/sign-out-button";
import { AddTransactionButton } from "@/components/transactions/add-transaction-button";
import { APP_NAME } from "@/lib/config";

const links = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/transactions", label: "Transactions" },
  { href: "/budget", label: "Budget" },
  { href: "/categories", label: "Categories" },
  { href: "/accounts", label: "Accounts" },
  { href: "/bills", label: "Bills" },
  { href: "/loans-cards", label: "Loans & Cards" },
  { href: "/reports", label: "Reports" },
  { href: "/recurring", label: "Recurring" },
  { href: "/settings", label: "Settings" },
];

type AccountOption = { id: string; name: string; currency: string };
type CategoryOption = { id: string; name: string; subcategories: { id: string; name: string }[] };

export function TopNav({
  accounts,
  categories,
}: {
  accounts: AccountOption[];
  categories: CategoryOption[];
}) {
  const pathname = usePathname();

  return (
    <header className="border-b bg-[var(--nav-background)]">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2 font-semibold text-[var(--nav-foreground)]">
          <Wallet className="h-5 w-5" />
          {APP_NAME}
        </div>
        <nav className="flex items-center gap-4 text-sm">
          {links.map((link) => {
            const isActive = pathname === link.href || pathname?.startsWith(`${link.href}/`);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={
                  isActive
                    ? "border-b-2 border-[var(--primary)] pb-0.5 text-[var(--nav-foreground)]"
                    : "border-b-2 border-transparent pb-0.5 text-[var(--nav-foreground)]/70 hover:text-[var(--nav-foreground)]"
                }
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-2">
          <AddTransactionButton accounts={accounts} categories={categories} />
          <SignOutButton />
        </div>
      </div>
    </header>
  );
}
```

- [ ] **Step 4: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: wire next-themes and per-user accent into the root layout; brand the top nav"
```

---

### Task 7: The Settings page — Appearance section

**Files:**
- Create: `src/components/settings/appearance-settings.tsx`
- Modify: `src/app/(app)/settings/page.tsx`

- [ ] **Step 1: Implement `src/components/settings/appearance-settings.tsx`**

```typescript
"use client";

import { useState } from "react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { updateAccentColorAction, updateThemeModeAction } from "@/actions/settings.actions";
import { ACCENT_COLORS, THEME_MODES } from "@/lib/constants/appearance";
import { Label } from "@/components/ui/label";

export function AppearanceSettings({
  initialAccentColor,
  initialThemeMode,
}: {
  initialAccentColor: string;
  initialThemeMode: string;
}) {
  const { setTheme } = useTheme();
  const [accentColor, setAccentColor] = useState(initialAccentColor);
  const [themeMode, setThemeMode] = useState(initialThemeMode);

  async function handleAccentChange(value: string) {
    setAccentColor(value);
    const result = await updateAccentColorAction(value);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Accent color updated");
  }

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
        <Label>Accent color</Label>
        <div className="flex gap-2">
          {ACCENT_COLORS.map((color) => (
            <button
              key={color.value}
              type="button"
              aria-label={color.label}
              onClick={() => handleAccentChange(color.value)}
              className="h-8 w-8 rounded-full border-2"
              style={{
                backgroundColor: color.swatch,
                borderColor: accentColor === color.value ? color.swatch : "transparent",
                outline: accentColor === color.value ? "2px solid currentColor" : "none",
                outlineOffset: 2,
              }}
            />
          ))}
        </div>
      </div>

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

- [ ] **Step 2: Implement `src/app/(app)/settings/page.tsx`**

```typescript
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { AppearanceSettings } from "@/components/settings/appearance-settings";

export default async function SettingsPage() {
  const session = await auth();
  const user = await prisma.user.findUniqueOrThrow({ where: { id: session!.user.id } });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Settings</h1>

      <div>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">Appearance</h2>
        <AppearanceSettings initialAccentColor={user.accentColor} initialThemeMode={user.themeMode} />
      </div>
    </div>
  );
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
git commit -m "feat: add Appearance section to Settings (accent color and theme mode)"
```

---

### Task 8: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

```bash
npm test
```

Expected: all tests pass (existing 199 plus this plan's new tests — 4 validation + 2 domain = 6 new tests, 205 total).

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Browser walkthrough**

Start the dev server, log in as `demo@example.com` / `demopassword123`, and manually verify (fixing any real bug found, then re-running Steps 1–2):

- The whole app now has a warm cream background instead of stark white, and the top nav is a deep green bar instead of a plain white/bordered strip.
- The active nav link (whichever page you're on) shows a coral underline; other links don't.
- Buttons, focus rings, and other "accent" elements are coral by default.
- Go to Settings → Appearance. Click a different accent swatch (e.g. blue) — confirm buttons/underline/focus rings across the app switch to blue immediately after the page refreshes (this uses `router`-triggered layout revalidation, so check by navigating to another page, e.g. Accounts, and back).
- Click "dark" under Theme — confirm the whole app switches to the dark palette instantly (no navigation needed, this one uses `next-themes`'s own client-side mechanism). Click "light", confirm it switches back. Click "system" and confirm it follows the OS/browser preference.
- Sign out and back in (or open a private/incognito window and log in) — confirm the accent color and theme mode chosen are still in effect immediately on first load, confirming they were correctly persisted to `User.accentColor`/`User.themeMode` and read back by the root layout, not just held in the one browser's `next-themes` localStorage.
- Set the accent color back to "coral" and the theme back to "system" (or whatever the user had before) once you're done, so the demo account is left in its default state.

- [ ] **Step 4: Confirm a clean working tree**

```bash
git status --short
```

Expected: no output (everything already committed; verification found no code changes needed, or any fix was committed above).
