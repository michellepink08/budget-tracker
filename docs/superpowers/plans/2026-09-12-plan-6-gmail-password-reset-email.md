# Gmail Password-Reset Email Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `console.log` placeholder in the forgot-password flow with a real email send over Gmail SMTP, using Nodemailer and a Google App Password.

**Architecture:** Two new pure/DI-friendly modules — `src/lib/email-templates/password-reset.ts` (pure HTML/text template functions) and `src/lib/mailer.ts` (a `Pick<Transporter,"sendMail">`-typed wrapper, mirroring the existing `Pick<PrismaClient,...>` DI pattern used across `src/lib/*.ts`). `sendPasswordResetEmail` itself catches and logs its own send failure and never throws — this keeps `src/actions/password-reset.actions.ts` a thin, untested wrapper (consistent with every other action in this codebase: only `src/lib/*.ts` has test files; `src/actions/*.ts` never does) while still making the failure-handling behavior unit-testable at the lib layer.

**Tech Stack:** `nodemailer` (SMTP client) + `@types/nodemailer` (dev dependency), Vitest for testing, existing `.env`-based config.

---

### Task 1: Install dependencies

**Files:**
- Modify: `package.json`, `package-lock.json`

- [ ] **Step 1: Install nodemailer and its types**

Run:
```bash
npm install nodemailer@10.0.9
npm install --save-dev @types/nodemailer@8.0.1
```

- [ ] **Step 2: Verify install**

Run: `npm ls nodemailer @types/nodemailer`
Expected: both listed with no errors (no unmet peer dependency warnings for these two packages).

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add nodemailer dependency for password-reset emails

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Email templates

**Files:**
- Create: `src/lib/email-templates/password-reset.ts`
- Test: `src/lib/email-templates/password-reset.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/email-templates/password-reset.test.ts
import { describe, expect, it } from "vitest";
import { passwordResetEmailHtml, passwordResetEmailText } from "@/lib/email-templates/password-reset";

const resetUrl = "http://localhost:3000/reset-password?token=abc123";

describe("passwordResetEmailHtml", () => {
  it("embeds the reset URL inside an anchor tag", () => {
    const html = passwordResetEmailHtml(resetUrl);
    expect(html).toContain(`href="${resetUrl}"`);
  });

  it("is a full HTML document", () => {
    const html = passwordResetEmailHtml(resetUrl);
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("</html>");
  });
});

describe("passwordResetEmailText", () => {
  it("embeds the reset URL as plain text", () => {
    const text = passwordResetEmailText(resetUrl);
    expect(text).toContain(resetUrl);
  });

  it("does not contain any HTML tags", () => {
    const text = passwordResetEmailText(resetUrl);
    expect(text).not.toContain("<");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/email-templates/password-reset.test.ts`
Expected: FAIL — `Cannot find module '@/lib/email-templates/password-reset'`

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/email-templates/password-reset.ts

// Inline styles only — no external images or webfonts, matching the app's
// cream background / deep muted-green accent. Keeps the email lightweight
// and avoids deliverability issues tied to loading external assets.
export function passwordResetEmailHtml(resetUrl: string): string {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:32px;background-color:#faf6ef;font-family:system-ui,-apple-system,sans-serif;color:#1f2a24;">
    <div style="max-width:480px;margin:0 auto;background-color:#ffffff;border-radius:8px;padding:32px;">
      <h1 style="margin:0 0 16px;font-size:20px;color:#1f2a24;">Reset your password</h1>
      <p style="margin:0 0 24px;font-size:14px;line-height:1.5;color:#4b5a52;">
        We received a request to reset the password on your Budget Tracker account.
        This link expires in 1 hour and can only be used once.
      </p>
      <a
        href="${resetUrl}"
        style="display:inline-block;padding:12px 24px;background-color:#2f4a3c;color:#ffffff;border-radius:6px;text-decoration:none;font-size:14px;font-weight:600;"
      >
        Reset password
      </a>
      <p style="margin:24px 0 0;font-size:12px;line-height:1.5;color:#8a978f;">
        If you didn't request this, you can safely ignore this email.
      </p>
    </div>
  </body>
</html>`;
}

export function passwordResetEmailText(resetUrl: string): string {
  return `Reset your password

We received a request to reset the password on your Budget Tracker account.
This link expires in 1 hour and can only be used once.

${resetUrl}

If you didn't request this, you can safely ignore this email.`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/email-templates/password-reset.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/email-templates/password-reset.ts src/lib/email-templates/password-reset.test.ts
git commit -m "feat: add password-reset email templates

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Mailer module

**Files:**
- Create: `src/lib/mailer.ts`
- Test: `src/lib/mailer.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/mailer.test.ts
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { sendPasswordResetEmail, type Mailer } from "@/lib/mailer";

const resetUrl = "http://localhost:3000/reset-password?token=abc123";

function makeFakeMailer(sendMailImpl?: () => Promise<unknown>): Mailer {
  return {
    sendMail: vi.fn(sendMailImpl ?? (() => Promise.resolve({}))),
  };
}

describe("sendPasswordResetEmail", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("sends to the given address with a non-empty subject and both html and text bodies", async () => {
    const mailer = makeFakeMailer();

    await sendPasswordResetEmail(mailer, "demo@example.com", resetUrl);

    expect(mailer.sendMail).toHaveBeenCalledTimes(1);
    const message = (mailer.sendMail as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(message.to).toBe("demo@example.com");
    expect(message.subject.length).toBeGreaterThan(0);
    expect(message.html).toContain(resetUrl);
    expect(message.text).toContain(resetUrl);
  });

  it("logs and does not throw when the underlying send fails", async () => {
    const mailer = makeFakeMailer(() => Promise.reject(new Error("SMTP down")));

    await expect(sendPasswordResetEmail(mailer, "demo@example.com", resetUrl)).resolves.toBeUndefined();

    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/mailer.test.ts`
Expected: FAIL — `Cannot find module '@/lib/mailer'`

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/mailer.ts
import nodemailer from "nodemailer";
import { passwordResetEmailHtml, passwordResetEmailText } from "@/lib/email-templates/password-reset";

// The minimal shape we depend on — lets tests inject a mock instead of a
// real nodemailer transport, mirroring the Pick<PrismaClient, ...> pattern
// used across this codebase's other lib modules.
export type Mailer = {
  sendMail: (message: {
    to: string;
    from: string;
    subject: string;
    html: string;
    text: string;
  }) => Promise<unknown>;
};

// Builds a real Gmail SMTP transport. Deliberately not unit-tested — it's
// thin wiring around nodemailer's own transport construction, the same way
// src/lib/prisma.ts's real client construction isn't unit-tested either.
// Requires GMAIL_USER / GMAIL_APP_PASSWORD to be set (see .env.example).
export function createMailer(): Mailer {
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });
}

// Never throws — a failed send is logged and swallowed here so callers
// (server actions) can stay thin and the generic "check your email"
// response never has to change based on whether sending actually worked.
export async function sendPasswordResetEmail(
  mailer: Mailer,
  to: string,
  resetUrl: string,
): Promise<void> {
  try {
    await mailer.sendMail({
      to,
      from: process.env.GMAIL_USER ?? "no-reply@localhost",
      subject: "Reset your Budget Tracker password",
      html: passwordResetEmailHtml(resetUrl),
      text: passwordResetEmailText(resetUrl),
    });
  } catch (err) {
    console.error("[password reset] failed to send email", err);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/mailer.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/mailer.ts src/lib/mailer.test.ts
git commit -m "feat: add Gmail SMTP mailer for password-reset emails

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Wire the mailer into the server action

**Files:**
- Modify: `src/actions/password-reset.actions.ts`

- [ ] **Step 1: Replace the console.log placeholder**

Find this block in `requestPasswordResetAction`:

```typescript
if (result) {
  const baseUrl = process.env.APP_URL ?? "http://localhost:3000";
  const resetUrl = `${baseUrl}/reset-password?token=${result.token}`;
  console.log(`[password reset] ${resetUrl}`); // dev-mode placeholder for real email sending
}
```

Replace it with:

```typescript
if (result) {
  const baseUrl = process.env.APP_URL ?? "http://localhost:3000";
  const resetUrl = `${baseUrl}/reset-password?token=${result.token}`;
  await sendPasswordResetEmail(createMailer(), parsed.data.email, resetUrl);
}
```

Add the import at the top of the file:

```typescript
import { createMailer, sendPasswordResetEmail } from "@/lib/mailer";
```

- [ ] **Step 2: Run the full test suite**

Run: `npm test`
Expected: PASS — same count as before plus the 6 new tests from Tasks 2–3 (219 + 6 = 225 total). No existing test touches this action directly (this codebase only unit-tests `src/lib/*.ts`, never `src/actions/*.ts`), so nothing here should regress.

- [ ] **Step 3: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: both clean (0 errors).

- [ ] **Step 4: Commit**

```bash
git add src/actions/password-reset.actions.ts
git commit -m "feat: send real password-reset emails via Gmail SMTP

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Config and documentation

**Files:**
- Modify: `.env.example`
- Modify: `docs/ARCHITECTURE.md`

- [ ] **Step 1: Add the new env vars to `.env.example`**

Replace:
```
# Used to build the link logged by the (currently dev-mode) password-reset flow — see docs/ARCHITECTURE.md.
APP_URL="http://localhost:3000"
```

With:
```
# Used to build the reset link sent in password-reset emails — see docs/ARCHITECTURE.md.
APP_URL="http://localhost:3000"

# Gmail SMTP credentials for sending password-reset emails — see docs/ARCHITECTURE.md.
GMAIL_USER="your-address@gmail.com"
GMAIL_APP_PASSWORD="16-character App Password from Google Account > Security > App Passwords"
```

- [ ] **Step 2: Document the setup in `docs/ARCHITECTURE.md`**

Add a new section after "## Reconciliation never silently overwrites" (before "## Deployment: SQLite → Postgres"):

```markdown
## Password-reset email (Gmail SMTP)

The forgot-password flow (`src/lib/password-reset.ts`, `src/lib/mailer.ts`) sends its reset link over Gmail SMTP via Nodemailer, authenticated with a Google **App Password** rather than the account's real password. `src/lib/mailer.ts`'s `sendPasswordResetEmail` never throws — a failed send is logged server-side and swallowed, so the user-facing response stays identical whether the email was sent, failed to send, or was never registered in the first place (this is the same account-enumeration protection `src/lib/password-reset.ts` already relies on).

One-time setup for whichever Gmail account will send these:
1. Enable 2-Step Verification on that Google account.
2. Generate an App Password: Google Account → Security → 2-Step Verification → App Passwords → generate one for "Mail".
3. Set `GMAIL_USER` (the address) and `GMAIL_APP_PASSWORD` (the generated 16-character password) in `.env`.

Without these two variables set, `createMailer()` will build a transport that fails auth on every send — which `sendPasswordResetEmail` catches and logs, so the app keeps working (the reset link just won't arrive by email; check the server logs for the failure).
```

- [ ] **Step 3: Commit**

```bash
git add .env.example docs/ARCHITECTURE.md
git commit -m "docs: document Gmail SMTP setup for password-reset email

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: Manual verification with a real Gmail account

**Files:** none (manual verification only)

- [ ] **Step 1: Get the user's Gmail App Password**

Ask the user to complete the one-time setup from Task 5 (2-Step Verification + App Password) and provide `GMAIL_USER` / `GMAIL_APP_PASSWORD` values to put in their local `.env`. **Do not ask the user to paste the App Password into chat** — instruct them to add it directly to their local `.env` file themselves, since it is a credential (per the standing rule against handling credentials).

- [ ] **Step 2: Restart the dev server**

Run: `npm run dev` (restart so the new `.env` values are picked up)

- [ ] **Step 3: Request a real password reset in the browser**

Navigate to `/forgot-password`, submit the demo account's email (or a real inbox the user controls), and confirm:
- The generic "check your email" message still shows in the UI
- No error appears in the server console
- The email actually arrives in the inbox within a minute or two, with working "Reset password" button/link
- Following the link and setting a new password still works end-to-end (same flow verified in Plan 5)

- [ ] **Step 4: Confirm the failure path doesn't break the app**

Temporarily set `GMAIL_APP_PASSWORD` to an incorrect value, restart the dev server, request another reset, and confirm:
- The UI still shows the same generic success message
- The server console logs `[password reset] failed to send email ...`
- The app does not crash or return an error to the user

Then restore the correct `GMAIL_APP_PASSWORD` and restart the dev server again.

- [ ] **Step 5: Restore the demo account's password**

If the real end-to-end reset in Step 3 changed the demo account's password, run:
```bash
npm run db:demo-user
```
and confirm a login with `demopassword123` still works.

---

### Task 7: Finish the branch

- [ ] **Step 1:** Follow superpowers:finishing-a-development-branch (tests, typecheck, lint already verified in Task 4; per standing user instruction, merge locally without presenting the options menu).
