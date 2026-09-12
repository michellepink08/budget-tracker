# Plan 5: Forgot Password Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A real, working forgot-password flow — token generation, expiry, and the reset-password page — with real email delivery deliberately deferred as its own later decision (per the user's explicit "we'll get to this later" on which provider to use). The "send an email" step is a single, clearly-marked dev-mode stub that logs the reset link to the server console instead of delivering it.

**Architecture:**
- **Tokens are single-use and hashed at rest.** A `PasswordResetToken` row stores `sha256(token)`, never the plaintext token — the same reasoning as never storing a plaintext password, just with a fast hash instead of bcrypt's slow one, since a random 32-byte token already has far more entropy than a human-chosen password needs defending against brute force. The plaintext token exists only in the URL sent to the user and is never persisted anywhere.
- **Requesting a reset never reveals whether an email is registered.** `requestPasswordResetAction` always returns `{ ok: true }`, whether or not that email matched a user — the page shows the same "if that email is registered, we've sent a link" message either way. This is the standard mitigation for account enumeration via a password-reset form.
- **The email-sending step is one function call, clearly marked as a placeholder.** `requestPasswordResetAction` logs the reset URL via `console.log` instead of calling a real email provider — the swap point for Resend/SendGrid/etc. later is exactly that one line, not a redesign.
- **Tokens expire in 1 hour and are single-use.** `resetPassword` checks both `expiresAt` and `usedAt` before honoring a token, and marks it used immediately on a successful reset — a token can't be replayed even if the reset-password page is left open after use.

**Tech Stack:** No new dependencies — `crypto` is a Node built-in, already implicitly available.

**Read first:** `src/lib/password.ts` (`hashPassword`, reused unchanged for actually changing the password); `src/app/(auth)/signup/page.tsx` (the form pattern this plan's new pages follow — `zodResolver` + `react-hook-form`, unlike `login/page.tsx` which happens not to use a resolver); `src/auth.ts` (the `authorized` callback's `publicPaths` allowlist — this plan adds two more paths to it, the same fix Plan 4.1 had to make for `/` after discovering signed-out visitors were blocked from reaching it).

**Scope boundary — explicitly NOT in this plan:** picking or wiring a real transactional email provider — deferred by the user's explicit choice; rate-limiting the forgot-password endpoint (a reasonable production hardening step, but this app has no rate-limiting anywhere yet, so singling this endpoint out would be inconsistent — a project-wide concern, not this plan's); "remember me"/session-duration changes; changing how login/signup themselves work.

---

### Task 1: Add `PasswordResetToken` to the schema

**Files:**
- Modify: `prisma/schema.prisma`, `prisma/schema.sql`

- [ ] **Step 1: Add the relation field to `User`**

```prisma
  passwordResetTokens PasswordResetToken[]
```

- [ ] **Step 2: Append the new model**

```prisma
model PasswordResetToken {
  id        String    @id @default(cuid())
  userId    String
  tokenHash String    @unique
  expiresAt DateTime
  usedAt    DateTime?
  createdAt DateTime  @default(now())

  user User @relation(fields: [userId], references: [id])
}
```

- [ ] **Step 3: Add the matching table to `prisma/schema.sql`**

Append:

```sql
CREATE TABLE IF NOT EXISTS "PasswordResetToken" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL UNIQUE,
  "expiresAt" DATETIME NOT NULL,
  "usedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("userId") REFERENCES "User" ("id")
);
CREATE INDEX IF NOT EXISTS "PasswordResetToken_userId_idx" ON "PasswordResetToken" ("userId");
```

- [ ] **Step 4: Apply the schema**

```bash
npm run db:push
```

Expected: `PasswordResetToken` table created, no errors.

- [ ] **Step 5: Regenerate the Prisma client and verify compile**

```bash
npx prisma generate
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add PasswordResetToken model"
```

---

### Task 2: Domain — `src/lib/password-reset.ts`

**Files:**
- Create: `src/lib/password-reset.ts`
- Test: `src/lib/password-reset.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/password-reset.test.ts
import { describe, expect, it, vi } from "vitest";
import crypto from "crypto";
import { requestPasswordReset, resetPassword } from "@/lib/password-reset";

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function makeFakePrisma(options: { user?: unknown; tokenRecord?: unknown } = {}) {
  const user = "user" in options ? options.user : { id: "user-1", email: "demo@example.com" };
  const tokenRecord = options.tokenRecord;
  return {
    user: {
      findUnique: vi.fn().mockResolvedValue(user),
      update: vi.fn().mockResolvedValue({}),
    },
    passwordResetToken: {
      create: vi.fn().mockResolvedValue({ id: "token-row-1" }),
      findUnique: vi.fn().mockResolvedValue(tokenRecord),
      update: vi.fn().mockResolvedValue({}),
    },
  } as any;
}

describe("requestPasswordReset", () => {
  it("creates a hashed, expiring token row for an existing user and returns the plaintext token", async () => {
    const prisma = makeFakePrisma();

    const result = await requestPasswordReset(prisma, "demo@example.com");

    expect(result).not.toBeNull();
    expect(result!.token).toEqual(expect.any(String));
    expect(result!.token.length).toBeGreaterThan(20);

    const createArgs = prisma.passwordResetToken.create.mock.calls[0][0].data;
    expect(createArgs.userId).toBe("user-1");
    expect(createArgs.tokenHash).toBe(hashToken(result!.token));
    expect(createArgs.expiresAt).toBeInstanceOf(Date);
    expect(createArgs.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("returns null for an email that isn't registered, without creating a token", async () => {
    const prisma = makeFakePrisma({ user: null });

    const result = await requestPasswordReset(prisma, "nobody@example.com");

    expect(result).toBeNull();
    expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
  });
});

describe("resetPassword", () => {
  it("updates the password and marks the token used, for a valid unused unexpired token", async () => {
    const token = "a".repeat(64);
    const prisma = makeFakePrisma({
      tokenRecord: {
        id: "token-row-1",
        userId: "user-1",
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        usedAt: null,
      },
    });

    const result = await resetPassword(prisma, token, "newpassword123");

    expect(result).toEqual({ ok: true });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { passwordHash: expect.any(String) },
    });
    expect(prisma.passwordResetToken.update).toHaveBeenCalledWith({
      where: { id: "token-row-1" },
      data: { usedAt: expect.any(Date) },
    });
  });

  it("rejects an unknown token", async () => {
    const prisma = makeFakePrisma({ tokenRecord: null });

    const result = await resetPassword(prisma, "not-a-real-token", "newpassword123");

    expect(result).toEqual({ ok: false, error: "This reset link is invalid or has expired" });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("rejects an already-used token", async () => {
    const token = "b".repeat(64);
    const prisma = makeFakePrisma({
      tokenRecord: {
        id: "token-row-1",
        userId: "user-1",
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        usedAt: new Date(),
      },
    });

    const result = await resetPassword(prisma, token, "newpassword123");

    expect(result).toEqual({ ok: false, error: "This reset link is invalid or has expired" });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("rejects an expired token", async () => {
    const token = "c".repeat(64);
    const prisma = makeFakePrisma({
      tokenRecord: {
        id: "token-row-1",
        userId: "user-1",
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() - 1000),
        usedAt: null,
      },
    });

    const result = await resetPassword(prisma, token, "newpassword123");

    expect(result).toEqual({ ok: false, error: "This reset link is invalid or has expired" });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/lib/password-reset.test.ts
```

Expected: FAIL — `src/lib/password-reset.ts` does not exist yet.

- [ ] **Step 3: Implement**

```typescript
// src/lib/password-reset.ts
import type { PrismaClient } from "@prisma/client";
import crypto from "crypto";
import { hashPassword } from "@/lib/password";

const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export type RequestPasswordResetResult = { token: string } | null;

// Returns null for an unregistered email — the caller must not use that to
// tell the requester anything different happened than for a real one
// (account-enumeration mitigation; see src/actions/password-reset.actions.ts).
export async function requestPasswordReset(
  prisma: Pick<PrismaClient, "user" | "passwordResetToken">,
  email: string,
): Promise<RequestPasswordResetResult> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return null;

  const token = crypto.randomBytes(32).toString("hex");
  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
    },
  });

  return { token };
}

export type ResetPasswordResult = { ok: true } | { ok: false; error: string };

export async function resetPassword(
  prisma: Pick<PrismaClient, "user" | "passwordResetToken">,
  token: string,
  newPassword: string,
): Promise<ResetPasswordResult> {
  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(token) },
  });

  if (!record || record.usedAt || record.expiresAt < new Date()) {
    return { ok: false, error: "This reset link is invalid or has expired" };
  }

  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({ where: { id: record.userId }, data: { passwordHash } });
  await prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } });

  return { ok: true };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/lib/password-reset.test.ts
```

Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add password reset domain functions"
```

---

### Task 3: Validation schemas

**Files:**
- Create: `src/lib/validations/password-reset.ts`
- Test: `src/lib/validations/password-reset.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/validations/password-reset.test.ts
import { describe, expect, it } from "vitest";
import { forgotPasswordSchema, resetPasswordSchema } from "@/lib/validations/password-reset";

describe("forgotPasswordSchema", () => {
  it("accepts a valid email", () => {
    expect(forgotPasswordSchema.safeParse({ email: "demo@example.com" }).success).toBe(true);
  });

  it("rejects an invalid email", () => {
    expect(forgotPasswordSchema.safeParse({ email: "not-an-email" }).success).toBe(false);
  });
});

describe("resetPasswordSchema", () => {
  it("accepts a token and a password of at least 8 characters", () => {
    const result = resetPasswordSchema.safeParse({ token: "abc123", password: "newpassword123" });
    expect(result.success).toBe(true);
  });

  it("rejects a password shorter than 8 characters", () => {
    const result = resetPasswordSchema.safeParse({ token: "abc123", password: "short" });
    expect(result.success).toBe(false);
  });

  it("rejects an empty token", () => {
    const result = resetPasswordSchema.safeParse({ token: "", password: "newpassword123" });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/lib/validations/password-reset.test.ts
```

Expected: FAIL — the schema file does not exist yet.

- [ ] **Step 3: Implement**

```typescript
// src/lib/validations/password-reset.ts
import { z } from "zod";

export const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8, "Password must be at least 8 characters"),
});
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/lib/validations/password-reset.test.ts
```

Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add forgot/reset password validation schemas"
```

---

### Task 4: Server actions

**Files:**
- Create: `src/actions/password-reset.actions.ts`

- [ ] **Step 1: Implement**

```typescript
// src/actions/password-reset.actions.ts
"use server";

import { prisma } from "@/lib/prisma";
import { forgotPasswordSchema, resetPasswordSchema } from "@/lib/validations/password-reset";
import { requestPasswordReset, resetPassword } from "@/lib/password-reset";

export type PasswordResetActionResult = { ok: true } | { ok: false; error: string };

export async function requestPasswordResetAction(
  formData: FormData,
): Promise<PasswordResetActionResult> {
  const parsed = forgotPasswordSchema.safeParse({ email: formData.get("email") });

  // Only ever proceed to look anything up when the input actually parses —
  // but either way, return { ok: true } below. Never let a caller tell
  // "that email isn't registered" apart from "that wasn't a valid email" or
  // "here's your reset link" — all three look identical from outside.
  if (parsed.success) {
    const result = await requestPasswordReset(prisma, parsed.data.email);
    if (result) {
      const baseUrl = process.env.APP_URL ?? "http://localhost:3000";
      const resetUrl = `${baseUrl}/reset-password?token=${result.token}`;
      // Dev-mode placeholder: log instead of emailing. The real send-an-
      // email call (Resend, SendGrid, etc.) is a deliberately deferred
      // decision — see docs/ARCHITECTURE.md — and this is the one line
      // that call replaces.
      console.log(`[password reset] ${resetUrl}`);
    }
  }

  return { ok: true };
}

export async function resetPasswordAction(formData: FormData): Promise<PasswordResetActionResult> {
  const parsed = resetPasswordSchema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { ok: false, error: "Enter a password of at least 8 characters" };
  }

  return resetPassword(prisma, parsed.data.token, parsed.data.password);
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
git commit -m "feat: add server actions for requesting and completing a password reset"
```

---

### Task 5: Forgot-password and reset-password pages

**Files:**
- Create: `src/app/(auth)/forgot-password/page.tsx`, `src/app/(auth)/reset-password/page.tsx`, `src/components/auth/reset-password-form.tsx`
- Modify: `src/app/(auth)/login/page.tsx`, `src/auth.ts`

- [ ] **Step 1: Implement the forgot-password page**

```typescript
// src/app/(auth)/forgot-password/page.tsx
"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import Link from "next/link";
import { forgotPasswordSchema } from "@/lib/validations/password-reset";
import { requestPasswordResetAction } from "@/actions/password-reset.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export default function ForgotPasswordPage() {
  const [submitted, setSubmitted] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordInput>({ resolver: zodResolver(forgotPasswordSchema) });

  async function onSubmit(values: ForgotPasswordInput) {
    const formData = new FormData();
    formData.set("email", values.email);
    await requestPasswordResetAction(formData);
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 px-4">
        <h1 className="text-xl font-semibold">Check your email</h1>
        <p className="text-sm text-muted-foreground">
          If an account exists for that email, we&apos;ve sent a link to reset your password.
        </p>
        <Link href="/login" className="text-sm underline">
          Back to log in
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 px-4">
      <h1 className="text-xl font-semibold">Reset your password</h1>
      <p className="text-sm text-muted-foreground">
        Enter your email and we&apos;ll send you a link to reset your password.
      </p>
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" {...register("email")} />
          {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
        </div>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Sending..." : "Send reset link"}
        </Button>
      </form>
      <Link href="/login" className="text-sm underline">
        Back to log in
      </Link>
    </div>
  );
}
```

- [ ] **Step 2: Implement the reset-password page**

Next.js requires any component calling `useSearchParams()` to be wrapped in a `<Suspense>` boundary, or `next build` fails with a build error (not just a warning) — `npm run build` is part of this project's normal workflow, so this isn't optional. Split the token-reading logic into its own component and wrap it from the page's default export:

```typescript
// src/components/auth/reset-password-form.tsx
"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import Link from "next/link";
import { resetPasswordSchema } from "@/lib/validations/password-reset";
import { resetPasswordAction } from "@/actions/password-reset.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { token, password: "" },
  });

  async function onSubmit(values: ResetPasswordInput) {
    setServerError(null);
    const formData = new FormData();
    formData.set("token", values.token);
    formData.set("password", values.password);
    const result = await resetPasswordAction(formData);
    if (!result.ok) {
      setServerError(result.error);
      return;
    }
    router.push("/login");
  }

  if (!token) {
    return (
      <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 px-4">
        <h1 className="text-xl font-semibold">Invalid link</h1>
        <p className="text-sm text-muted-foreground">
          This password reset link is missing its token. Request a new one.
        </p>
        <Link href="/forgot-password" className="text-sm underline">
          Request a new link
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 px-4">
      <h1 className="text-xl font-semibold">Set a new password</h1>
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <input type="hidden" {...register("token")} />
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password">New password</Label>
          <Input id="password" type="password" {...register("password")} />
          {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
        </div>
        {serverError && <p className="text-sm text-destructive">{serverError}</p>}
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving..." : "Reset password"}
        </Button>
      </form>
    </div>
  );
}
```

```typescript
// src/app/(auth)/reset-password/page.tsx
import { Suspense } from "react";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}
```

- [ ] **Step 3: Add a "Forgot password?" link to the login page**

In `src/app/(auth)/login/page.tsx`, add, right after the password field's error message and before the `serverError` paragraph:

```typescript
            <Link href="/forgot-password" className="text-sm underline">
              Forgot password?
            </Link>
```

(`Link` is already imported in that file.)

- [ ] **Step 4: Allow signed-out visitors to reach both new pages**

In `src/auth.ts`'s `authorized` callback, add the two new routes to `publicPaths` — the same fix Plan 4.1 had to make for `/`:

```typescript
      const publicPaths = ["/", "/login", "/signup", "/forgot-password", "/reset-password"];
```

- [ ] **Step 5: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add forgot-password and reset-password pages"
```

---

### Task 6: Document the `APP_URL` environment variable

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Add it**

```
APP_URL="http://localhost:3000"
```

Append this to `.env.example`, with a short comment above it: `# Used to build the link logged by the (currently dev-mode) password-reset flow — see docs/ARCHITECTURE.md.`

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "docs: document the APP_URL environment variable"
```

---

### Task 7: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

```bash
npm test
```

Expected: all tests pass (existing 208 plus this plan's new tests — 7 domain + 5 validation = 12 new tests, 220 total).

- [ ] **Step 2: Typecheck, lint, and a production build**

```bash
npx tsc --noEmit
npm run lint
npm run build
```

The build check specifically confirms the `<Suspense>` boundary around `ResetPasswordForm` (Task 5) is correct — a missing or misplaced one fails `next build` outright, not just a warning.

Expected: no errors either way.

- [ ] **Step 3: Browser walkthrough**

Start the dev server (fresh restart recommended, per this session's recurring stale-webpack-cache pattern after structural changes) and, signed out:

- Go to `/login`, click "Forgot password?" — confirm it reaches `/forgot-password` without redirecting to login first (confirms the `publicPaths` fix worked).
- Submit the demo account's email (`demo@example.com`) — confirm the generic "check your email" message appears, and check the dev server's terminal output for a logged `[password reset] http://localhost:3000/reset-password?token=...` line.
- Submit an email that isn't registered — confirm the **same** generic message appears (no way to tell the difference from outside), and confirm nothing was logged to the console for it.
- Copy the logged URL for the demo account and visit it — confirm the reset-password page loads with the token pre-filled (as a hidden field) and asks only for a new password.
- Set a new password, submit — confirm it redirects to `/login`, and confirm logging in with the demo account's **new** password works.
- Try reusing the exact same reset link again — confirm it's rejected as invalid/expired (the token was already consumed).
- Visit `/reset-password` with no `?token=` at all — confirm it shows the "invalid link" state, not a crash.
- **Clean up:** reset the demo account's password back to `demopassword123` afterward (either by running the reset flow once more, or directly: `npm run db:demo-user` recreates it with the default password) so the documented demo credentials in the README keep working for anyone who reads them.

- [ ] **Step 4: Confirm a clean working tree**

```bash
git status --short
```

Expected: no output (everything already committed; verification found no code changes needed, or any fix was committed above).
