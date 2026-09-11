# Onboarding Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** New users must set their budget cycle start day, currency, and accent color before they can reach any app page.

**Architecture:** A nullable `onboardedAt` column on `User` marks completion. The `(app)` layout (already wrapping every app page) checks it on every request and redirects to a new, top-nav-free `/onboarding` page if unset. Submitting the onboarding form updates the user and stamps `onboardedAt`.

**Tech Stack:** Same as Plan 1 (Next.js App Router, Prisma + better-sqlite3 driver adapter, zod, react-hook-form, shadcn/ui).

---

### Task 1: Add `onboardedAt` to the schema and rebuild the local database

**Files:**
- Modify: `prisma/schema.prisma`, `prisma/schema.sql`

- [ ] **Step 1: Add the column to both schema files**

`prisma/schema.prisma` — add to `model User`:

```prisma
onboardedAt DateTime?
```

`prisma/schema.sql` — add to the `User` table:

```sql
"onboardedAt" DATETIME
```

- [ ] **Step 2: Rebuild the local database**

This machine's `db:push` only runs `CREATE TABLE IF NOT EXISTS`, so it won't alter an existing table. Delete and recreate:

```bash
rm -f prisma/dev.db
npm run db:generate
npm run db:push
npm run db:demo-user
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: add onboardedAt column to User"
```

---

### Task 2: Onboarding validation schema (with tests)

**Files:**
- Create: `src/lib/validations/onboarding.ts`
- Test: `src/lib/validations/onboarding.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/validations/onboarding.test.ts
import { describe, expect, it } from "vitest";
import { onboardingSchema } from "@/lib/validations/onboarding";

describe("onboardingSchema", () => {
  it("accepts a valid cycle start day, currency, and accent color", () => {
    const result = onboardingSchema.safeParse({
      cycleStartDay: 25,
      currency: "PHP",
      accentColor: "coral",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a cycle start day below 1", () => {
    const result = onboardingSchema.safeParse({
      cycleStartDay: 0,
      currency: "PHP",
      accentColor: "coral",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a cycle start day above 31", () => {
    const result = onboardingSchema.safeParse({
      cycleStartDay: 32,
      currency: "PHP",
      accentColor: "coral",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty currency", () => {
    const result = onboardingSchema.safeParse({
      cycleStartDay: 25,
      currency: "",
      accentColor: "coral",
    });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/validations/onboarding.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/validations/onboarding'`.

- [ ] **Step 3: Write the schema**

```typescript
// src/lib/validations/onboarding.ts
import { z } from "zod";

export const onboardingSchema = z.object({
  cycleStartDay: z.coerce.number().int().min(1).max(31),
  currency: z.string().min(1),
  accentColor: z.string().min(1),
});
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/lib/validations/onboarding.test.ts
```

Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add onboarding validation schema"
```

---

### Task 3: Onboarding completion logic (dependency-injected, with tests)

**Files:**
- Create: `src/lib/onboarding.ts`
- Test: `src/lib/onboarding.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/onboarding.test.ts
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
  it("saves the cycle day, currency, and accent color, and stamps onboardedAt", async () => {
    const prisma = makeFakePrisma();

    await completeOnboarding(prisma, "user-1", {
      cycleStartDay: 25,
      currency: "PHP",
      accentColor: "coral",
    });

    expect(prisma.user.update).toHaveBeenCalledTimes(1);
    const args = prisma.user.update.mock.calls[0][0];
    expect(args.where).toEqual({ id: "user-1" });
    expect(args.data.cycleStartDay).toBe(25);
    expect(args.data.currency).toBe("PHP");
    expect(args.data.accentColor).toBe("coral");
    expect(args.data.onboardedAt).toBeInstanceOf(Date);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/onboarding.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/onboarding'`.

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/onboarding.ts
import type { PrismaClient } from "@prisma/client";

export type OnboardingInput = {
  cycleStartDay: number;
  currency: string;
  accentColor: string;
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
      accentColor: input.accentColor,
      onboardedAt: new Date(),
    },
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/lib/onboarding.test.ts
```

Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add onboarding completion logic with unit test"
```

---

### Task 4: Onboarding server action

**Files:**
- Create: `src/actions/onboarding.actions.ts`

- [ ] **Step 1: Write the action**

```typescript
// src/actions/onboarding.actions.ts
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
    cycleStartDay: formData.get("cycleStartDay"),
    currency: formData.get("currency"),
    accentColor: formData.get("accentColor"),
  });

  if (!parsed.success) {
    return { ok: false, error: "Enter a valid cycle start day (1-31), currency, and accent color" };
  }

  await completeOnboarding(prisma, session.user.id, parsed.data);

  return { ok: true };
}
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "feat: add onboarding server action"
```

---

### Task 5: Onboarding page

**Files:**
- Create: `src/app/onboarding/page.tsx`

- [ ] **Step 1: Write the page**

```tsx
// src/app/onboarding/page.tsx
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

const ACCENT_COLORS = [
  { value: "coral", label: "Coral", swatch: "#ff6b5e" },
  { value: "blue", label: "Blue", swatch: "#3b82f6" },
  { value: "green", label: "Green", swatch: "#16a34a" },
  { value: "purple", label: "Purple", swatch: "#8b5cf6" },
  { value: "neutral", label: "Neutral", swatch: "#71717a" },
];

const CURRENCIES = ["PHP", "USD"];

export default function OnboardingPage() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<OnboardingInput>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: { cycleStartDay: 1, currency: "PHP", accentColor: "coral" },
  });

  const selectedAccent = watch("accentColor");

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
        A few things before you get started. You can change these later in Settings.
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

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="currency">Currency</Label>
          <select
            id="currency"
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
            {...register("currency")}
          >
            {CURRENCIES.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
          {errors.currency && <p className="text-sm text-destructive">{errors.currency.message}</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Accent color</Label>
          <div className="flex gap-2">
            {ACCENT_COLORS.map((color) => (
              <button
                key={color.value}
                type="button"
                aria-label={color.label}
                onClick={() => setValue("accentColor", color.value, { shouldValidate: true })}
                className="h-8 w-8 rounded-full border-2"
                style={{
                  backgroundColor: color.swatch,
                  borderColor: selectedAccent === color.value ? color.swatch : "transparent",
                  outline: selectedAccent === color.value ? "2px solid currentColor" : "none",
                  outlineOffset: 2,
                }}
              />
            ))}
          </div>
          {errors.accentColor && (
            <p className="text-sm text-destructive">{errors.accentColor.message}</p>
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

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "feat: add onboarding page"
```

---

### Task 6: Gate app pages behind onboarding

**Files:**
- Modify: `src/app/(app)/layout.tsx`
- Create: `src/app/onboarding/guard.ts`, `src/app/onboarding/layout.tsx`

- [ ] **Step 1: Redirect un-onboarded users from the app shell**

```tsx
// src/app/(app)/layout.tsx
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { TopNav } from "@/components/nav/top-nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (session?.user) {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { onboardedAt: true },
    });
    if (!user?.onboardedAt) {
      redirect("/onboarding");
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <TopNav />
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
```

- [ ] **Step 2: Send already-onboarded users away from the onboarding page**

The onboarding page itself (Task 5) is a client component (it needs `react-hook-form` state), so the "already onboarded? bounce to /dashboard" check goes in a server-side guard function called from a layout that wraps just this route — that way the check runs before the client form ever renders.

Create `src/app/onboarding/guard.ts`:

```typescript
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function requireNotOnboarded() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { onboardedAt: true },
  });
  if (user?.onboardedAt) {
    redirect("/dashboard");
  }
}
```

Create `src/app/onboarding/layout.tsx`:

```tsx
import { requireNotOnboarded } from "@/app/onboarding/guard";

export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  await requireNotOnboarded();
  return <>{children}</>;
}
```

- [ ] **Step 3: Verify build**

```bash
npx tsc --noEmit
```

Expected: no type errors.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: gate app pages behind onboarding completion"
```

---

### Task 7: End-to-end manual verification

- [ ] **Step 1: Run the automated test suite**

```bash
npm test
```

Expected: all tests pass, including the 4 new onboarding-schema tests and 1 new onboarding-logic test.

- [ ] **Step 2: Walk through the flow in a browser**

1. Sign up a brand-new account.
2. Log in.
3. Should land on `/onboarding`, not `/dashboard`.
4. Try submitting with an out-of-range cycle day (e.g. 40) — should show a validation error, not save.
5. Set cycle day 25, currency PHP, accent coral, submit — should redirect to `/dashboard`.
6. Manually visit `/onboarding` again — should redirect to `/dashboard` (already onboarded).
7. Confirm the existing demo user (recreated in Task 1, so `onboardedAt` is null) also gets sent to `/onboarding` on next login.

- [ ] **Step 3: Commit any fixes found**

```bash
git add -A
git commit -m "fix: address issues found during onboarding verification"
```
