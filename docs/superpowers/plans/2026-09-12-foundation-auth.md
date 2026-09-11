# Foundation & Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Next.js project with Tailwind + shadcn/ui + lucide-react, wire up Prisma/SQLite and Auth.js (email+password), and ship a protected app shell with top navigation — a working "sign up → log in → see empty dashboard shell → sign out" flow.

**Architecture:** Next.js App Router with a route-group split: `(auth)` for public signup/login pages, `(app)` for the authenticated shell (top nav + placeholder pages), protected by Auth.js v5 middleware using the JWT session strategy (no adapter needed since Credentials-only). Core signup logic is written as a small dependency-injected function so it's unit-testable without a real database.

**Tech Stack:** Next.js (App Router, TypeScript), Tailwind CSS, shadcn/ui, lucide-react, Prisma + SQLite, Auth.js (NextAuth v5) Credentials provider, bcryptjs, zod, react-hook-form, Vitest.

This is **Plan 1 of 3** for the Budget Tracker (see `docs/superpowers/specs/2026-09-12-budget-tracker-design.md`). Plans 2 (core budgeting: cycle math, accounts/categories/transactions) and 3 (dashboard charts, recurring, settings) follow after this one is reviewed.

---

### Task 1: Scaffold the Next.js project

**Files:**
- Create: entire Next.js project structure at repo root (`D:\Budget Tracker`)

- [ ] **Step 1: Run create-next-app in the current directory**

```bash
npx create-next-app@latest . --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --no-turbopack
```

The directory already has `.git`, `.gitignore`, and `docs/` — these are all in create-next-app's allowed pre-existing files list, so it will not refuse to run here.

- [ ] **Step 2: Verify it runs**

```bash
npm run dev
```

Expected: dev server starts on `http://localhost:3000` showing the default Next.js starter page. Stop it with Ctrl+C once confirmed.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js project"
```

---

### Task 2: Install core dependencies and configure Vitest

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`

- [ ] **Step 1: Install runtime dependencies**

```bash
npm install prisma @prisma/client next-auth@beta bcryptjs zod react-hook-form @hookform/resolvers lucide-react
```

- [ ] **Step 2: Install dev dependencies**

```bash
npm install -D vitest @types/bcryptjs
```

- [ ] **Step 3: Create `vitest.config.ts`**

```typescript
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

- [ ] **Step 4: Add test scripts to `package.json`**

In the `"scripts"` section, add:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 5: Verify Vitest runs with no tests yet**

```bash
npm test
```

Expected: `No test files found` (exit code may be non-zero — that's fine, it confirms Vitest itself is wired up; real tests come in the next tasks).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: install core dependencies and configure Vitest"
```

---

### Task 3: Initialize shadcn/ui and add base components

**Files:**
- Create: `components.json`, `src/lib/utils.ts`, `src/components/ui/button.tsx`, `src/components/ui/input.tsx`, `src/components/ui/label.tsx`

- [ ] **Step 1: Initialize shadcn/ui**

```bash
npx shadcn@latest init -y -d
```

This uses the neutral/minimal default base style (matches the design decision) and non-interactive defaults.

- [ ] **Step 2: Add the components needed for auth pages**

```bash
npx shadcn@latest add button input label -y
```

- [ ] **Step 3: Verify the files exist**

Confirm `src/components/ui/button.tsx`, `src/components/ui/input.tsx`, and `src/components/ui/label.tsx` were created, and `src/lib/utils.ts` exports a `cn()` helper.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: initialize shadcn/ui with button, input, label"
```

---

### Task 4: Prisma schema, client, and database

**Files:**
- Create: `prisma/schema.prisma`, `src/lib/prisma.ts`
- Modify: `.env` (create if `create-next-app` didn't), `.gitignore` (already covers `.env*` and `prisma/dev.db`)

- [ ] **Step 1: Write `prisma/schema.prisma`**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

model User {
  id            String   @id @default(cuid())
  email         String   @unique
  passwordHash  String
  cycleStartDay Int      @default(1)
  currency      String   @default("PHP")
  accentColor   String   @default("coral")
  themeMode     String   @default("system")
  createdAt     DateTime @default(now())
}
```

- [ ] **Step 2: Add `DATABASE_URL` to `.env`**

```
DATABASE_URL="file:./dev.db"
```

- [ ] **Step 3: Generate the client and create the database**

```bash
npx prisma generate
npx prisma db push
```

Expected: `dev.db` created under `prisma/`, and output confirms the `User` table was created.

- [ ] **Step 4: Create the Prisma client singleton at `src/lib/prisma.ts`**

```typescript
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add Prisma schema with User model and client singleton"
```

---

### Task 5: Auth validation schemas (with tests)

**Files:**
- Create: `src/lib/validations/auth.ts`
- Test: `src/lib/validations/auth.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/validations/auth.test.ts
import { describe, expect, it } from "vitest";
import { loginSchema, signupSchema } from "@/lib/validations/auth";

describe("signupSchema", () => {
  it("accepts a valid email and an 8+ character password", () => {
    const result = signupSchema.safeParse({
      email: "person@example.com",
      password: "password123",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid email", () => {
    const result = signupSchema.safeParse({
      email: "not-an-email",
      password: "password123",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a password shorter than 8 characters", () => {
    const result = signupSchema.safeParse({
      email: "person@example.com",
      password: "short",
    });
    expect(result.success).toBe(false);
  });
});

describe("loginSchema", () => {
  it("accepts a valid email and a non-empty password", () => {
    const result = loginSchema.safeParse({
      email: "person@example.com",
      password: "anything",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an empty password", () => {
    const result = loginSchema.safeParse({
      email: "person@example.com",
      password: "",
    });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/validations/auth.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/validations/auth'`.

- [ ] **Step 3: Write the schemas**

```typescript
// src/lib/validations/auth.ts
import { z } from "zod";

export const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, "Password is required"),
});
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/lib/validations/auth.test.ts
```

Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add auth validation schemas"
```

---

### Task 6: Password hashing helper (with tests)

**Files:**
- Create: `src/lib/password.ts`
- Test: `src/lib/password.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/password.test.ts
import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/password";

describe("hashPassword / verifyPassword", () => {
  it("produces a hash that verifies against the original password", async () => {
    const hash = await hashPassword("password123");
    expect(hash).not.toBe("password123");
    await expect(verifyPassword("password123", hash)).resolves.toBe(true);
  });

  it("fails verification against the wrong password", async () => {
    const hash = await hashPassword("password123");
    await expect(verifyPassword("wrong-password", hash)).resolves.toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/password.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/password'`.

- [ ] **Step 3: Write the helper**

```typescript
// src/lib/password.ts
import bcrypt from "bcryptjs";

const SALT_ROUNDS = 10;

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/lib/password.test.ts
```

Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add password hashing helper"
```

---

### Task 7: Signup logic (dependency-injected, with tests)

This is the core "create a user" business logic, written so it can be unit tested against a **mocked** Prisma client — no real database needed for the test.

**Files:**
- Create: `src/lib/signup.ts`
- Test: `src/lib/signup.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/signup.test.ts
import { describe, expect, it, vi } from "vitest";
import { createUser } from "@/lib/signup";

function makeFakePrisma(existingUser: unknown = null) {
  return {
    user: {
      findUnique: vi.fn().mockResolvedValue(existingUser),
      create: vi.fn().mockResolvedValue({}),
    },
  } as any;
}

describe("createUser", () => {
  it("creates a user when the email is not already taken", async () => {
    const prisma = makeFakePrisma(null);

    const result = await createUser(prisma, "new@example.com", "password123");

    expect(result).toEqual({ ok: true });
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: "new@example.com" },
    });
    expect(prisma.user.create).toHaveBeenCalledTimes(1);
    const createArgs = prisma.user.create.mock.calls[0][0];
    expect(createArgs.data.email).toBe("new@example.com");
    expect(createArgs.data.passwordHash).not.toBe("password123");
  });

  it("rejects when the email is already in use", async () => {
    const prisma = makeFakePrisma({ id: "existing-id", email: "taken@example.com" });

    const result = await createUser(prisma, "taken@example.com", "password123");

    expect(result).toEqual({ ok: false, error: "Email already in use" });
    expect(prisma.user.create).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/signup.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/signup'`.

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/signup.ts
import type { PrismaClient } from "@prisma/client";
import { hashPassword } from "@/lib/password";

export type SignupResult = { ok: true } | { ok: false; error: string };

export async function createUser(
  prisma: Pick<PrismaClient, "user">,
  email: string,
  password: string,
): Promise<SignupResult> {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return { ok: false, error: "Email already in use" };
  }

  const passwordHash = await hashPassword(password);
  await prisma.user.create({ data: { email, passwordHash } });

  return { ok: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/lib/signup.test.ts
```

Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add signup logic with unit tests against a mocked Prisma client"
```

---

### Task 8: Auth.js configuration, route handler, and middleware

**Files:**
- Create: `src/auth.ts`, `src/app/api/auth/[...nextauth]/route.ts`, `src/middleware.ts`

- [ ] **Step 1: Generate an auth secret**

```bash
npx auth secret
```

Expected: adds an `AUTH_SECRET` value to `.env`.

- [ ] **Step 2: Write `src/auth.ts`**

```typescript
// src/auth.ts
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";
import { loginSchema } from "@/lib/validations/auth";

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials) => {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return null;

        const valid = await verifyPassword(password, user.passwordHash);
        if (!valid) return null;

        return { id: user.id, email: user.email };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) token.id = user.id;
      return token;
    },
    session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id as string;
      }
      return session;
    },
    authorized({ auth, request }) {
      const isLoggedIn = !!auth?.user;
      const publicPaths = ["/login", "/signup"];
      if (publicPaths.includes(request.nextUrl.pathname)) return true;
      return isLoggedIn;
    },
  },
});
```

- [ ] **Step 3: Write the route handler `src/app/api/auth/[...nextauth]/route.ts`**

```typescript
import { handlers } from "@/auth";

export const { GET, POST } = handlers;
```

- [ ] **Step 4: Write `src/middleware.ts`**

```typescript
export { auth as middleware } from "@/auth";

export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico).*)"],
};
```

- [ ] **Step 5: Verify the project still builds**

```bash
npx tsc --noEmit
```

Expected: no type errors. (If `session.user.id` errors as unknown property, that's expected until Task 9's module augmentation — if it errors here, add the augmentation below now instead.)

Add a module augmentation so `session.user.id` and the Credentials `user.id` are typed, in a new file:

```typescript
// src/types/next-auth.d.ts
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
    } & DefaultSession["user"];
  }
}
```

Re-run `npx tsc --noEmit` — expected: no type errors.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: configure Auth.js with Credentials provider and route protection"
```

---

### Task 9: Signup action and page

**Files:**
- Create: `src/actions/auth.actions.ts`, `src/app/(auth)/signup/page.tsx`

- [ ] **Step 1: Write the signup server action**

```typescript
// src/actions/auth.actions.ts
"use server";

import { prisma } from "@/lib/prisma";
import { signupSchema } from "@/lib/validations/auth";
import { createUser, type SignupResult } from "@/lib/signup";

export async function signupAction(formData: FormData): Promise<SignupResult> {
  const parsed = signupSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { ok: false, error: "Enter a valid email and a password of at least 8 characters" };
  }

  return createUser(prisma, parsed.data.email, parsed.data.password);
}
```

- [ ] **Step 2: Write the signup page**

```tsx
// src/app/(auth)/signup/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { signupSchema } from "@/lib/validations/auth";
import { signupAction } from "@/actions/auth.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";

type SignupInput = z.infer<typeof signupSchema>;

export default function SignupPage() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignupInput>({ resolver: zodResolver(signupSchema) });

  async function onSubmit(values: SignupInput) {
    setServerError(null);
    const formData = new FormData();
    formData.set("email", values.email);
    formData.set("password", values.password);
    const result = await signupAction(formData);
    if (!result.ok) {
      setServerError(result.error);
      return;
    }
    router.push("/login");
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 px-4">
      <h1 className="text-xl font-semibold">Create your account</h1>
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" {...register("email")} />
          {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" {...register("password")} />
          {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
        </div>
        {serverError && <p className="text-sm text-destructive">{serverError}</p>}
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Creating account..." : "Sign up"}
        </Button>
      </form>
      <p className="text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="underline">
          Log in
        </Link>
      </p>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: add signup page and server action"
```

---

### Task 10: Login page

**Files:**
- Create: `src/app/(auth)/login/page.tsx`

- [ ] **Step 1: Write the login page**

```tsx
// src/app/(auth)/login/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { signIn } from "next-auth/react";
import type { z } from "zod";
import { loginSchema } from "@/lib/validations/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";

type LoginInput = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  async function onSubmit(values: LoginInput) {
    setServerError(null);
    const result = await signIn("credentials", {
      email: values.email,
      password: values.password,
      redirect: false,
    });
    if (!result || result.error) {
      setServerError("Invalid email or password");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 px-4">
      <h1 className="text-xl font-semibold">Log in</h1>
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" {...register("email")} />
          {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" {...register("password")} />
          {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
        </div>
        {serverError && <p className="text-sm text-destructive">{serverError}</p>}
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Logging in..." : "Log in"}
        </Button>
      </form>
      <p className="text-sm text-muted-foreground">
        Don&apos;t have an account?{" "}
        <Link href="/signup" className="underline">
          Sign up
        </Link>
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "feat: add login page"
```

---

### Task 11: Root layout SessionProvider and home redirect

**Files:**
- Modify: `src/app/layout.tsx`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Wrap the root layout's children in `SessionProvider`**

Open `src/app/layout.tsx` (as generated by create-next-app). Add this import:

```typescript
import { SessionProvider } from "next-auth/react";
```

Then wrap the existing `{children}` inside `<body>` with `<SessionProvider>`:

```tsx
<body className={/* keep the existing generated className expression */}>
  <SessionProvider>{children}</SessionProvider>
</body>
```

Do not change the existing font variables, metadata export, or html/body attributes — only add the `SessionProvider` wrapper around `children`.

- [ ] **Step 2: Replace `src/app/page.tsx` with an auth-aware redirect**

```tsx
// src/app/page.tsx
import { redirect } from "next/navigation";
import { auth } from "@/auth";

export default async function Home() {
  const session = await auth();
  redirect(session ? "/dashboard" : "/login");
}
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: add SessionProvider and auth-aware home redirect"
```

---

### Task 12: Protected app shell — top nav, sign-out, placeholder pages

**Files:**
- Create: `src/components/nav/sign-out-button.tsx`, `src/components/nav/top-nav.tsx`, `src/app/(app)/layout.tsx`
- Create: `src/app/(app)/dashboard/page.tsx`, `src/app/(app)/transactions/page.tsx`, `src/app/(app)/categories/page.tsx`, `src/app/(app)/accounts/page.tsx`, `src/app/(app)/recurring/page.tsx`, `src/app/(app)/settings/page.tsx`

- [ ] **Step 1: Sign-out button**

```tsx
// src/components/nav/sign-out-button.tsx
import { signOut } from "@/auth";
import { Button } from "@/components/ui/button";

export function SignOutButton() {
  return (
    <form
      action={async () => {
        "use server";
        await signOut({ redirectTo: "/login" });
      }}
    >
      <Button type="submit" variant="ghost">
        Sign out
      </Button>
    </form>
  );
}
```

- [ ] **Step 2: Top nav**

```tsx
// src/components/nav/top-nav.tsx
import Link from "next/link";
import { Wallet } from "lucide-react";
import { SignOutButton } from "@/components/nav/sign-out-button";

const links = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/transactions", label: "Transactions" },
  { href: "/categories", label: "Categories" },
  { href: "/accounts", label: "Accounts" },
  { href: "/recurring", label: "Recurring" },
  { href: "/settings", label: "Settings" },
];

export function TopNav() {
  return (
    <header className="border-b">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2 font-semibold">
          <Wallet className="h-5 w-5" />
          Budget
        </div>
        <nav className="flex items-center gap-4 text-sm">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-muted-foreground hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <SignOutButton />
      </div>
    </header>
  );
}
```

- [ ] **Step 3: Protected layout**

```tsx
// src/app/(app)/layout.tsx
import { TopNav } from "@/components/nav/top-nav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <TopNav />
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
```

- [ ] **Step 4: Placeholder pages**

```tsx
// src/app/(app)/dashboard/page.tsx
export default function DashboardPage() {
  return <p className="text-muted-foreground">Dashboard coming soon.</p>;
}
```

```tsx
// src/app/(app)/transactions/page.tsx
export default function TransactionsPage() {
  return <p className="text-muted-foreground">Transactions coming soon.</p>;
}
```

```tsx
// src/app/(app)/categories/page.tsx
export default function CategoriesPage() {
  return <p className="text-muted-foreground">Categories coming soon.</p>;
}
```

```tsx
// src/app/(app)/accounts/page.tsx
export default function AccountsPage() {
  return <p className="text-muted-foreground">Accounts coming soon.</p>;
}
```

```tsx
// src/app/(app)/recurring/page.tsx
export default function RecurringPage() {
  return <p className="text-muted-foreground">Recurring transactions coming soon.</p>;
}
```

```tsx
// src/app/(app)/settings/page.tsx
export default function SettingsPage() {
  return <p className="text-muted-foreground">Settings coming soon.</p>;
}
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add protected app shell with top nav and placeholder pages"
```

---

### Task 13: End-to-end manual verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full automated test suite**

```bash
npm test
```

Expected: all Vitest tests pass (auth schemas, password helper, signup logic).

- [ ] **Step 2: Start the dev server**

```bash
npm run dev
```

- [ ] **Step 3: Walk through the flow in a browser**

1. Visit `http://localhost:3000` → should redirect to `/login`.
2. Click "Sign up", create an account with a real email and an 8+ character password → should redirect to `/login`.
3. Log in with those credentials → should redirect to `/dashboard`, showing the top nav and "Dashboard coming soon."
4. Click through Transactions, Categories, Accounts, Recurring, Settings — each shows its placeholder text.
5. Click "Sign out" → should redirect to `/login`.
6. Try visiting `http://localhost:3000/dashboard` directly while signed out → should redirect to `/login`.

- [ ] **Step 4: Stop the dev server** (Ctrl+C)

- [ ] **Step 5: Commit** (only if verification uncovered fixes; otherwise skip — nothing to commit)

```bash
git add -A
git commit -m "fix: address issues found during end-to-end verification"
```
