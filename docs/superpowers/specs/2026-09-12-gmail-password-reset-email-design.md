# Gmail Password-Reset Email — Design

**Status:** Approved by user, 2026-09-12

## Goal

Replace the dev-mode `console.log` placeholder in the forgot-password flow (see `docs/superpowers/plans/2026-09-12-plan-5-forgot-password.md`) with a real email send, using the user's own Gmail account as the sending mailbox.

## Context

The forgot-password flow (`src/actions/password-reset.actions.ts`) already generates a secure, single-use, expiring reset token and builds the reset URL. Today it only logs that URL to the server console. This spec covers wiring an actual send — nothing about the token/security model changes.

## Approach

**Send method:** Nodemailer over Gmail SMTP, authenticated with a Google **App Password** (not the account's real password — Gmail requires 2-Step Verification to be enabled and an App Password generated from Google Account → Security → App Passwords). This was chosen over the Gmail API + OAuth2 because it needs far less setup (no Google Cloud project, no OAuth client, no refresh-token handling) and is the standard approach for a single sending mailbox.

**Error handling:** If the SMTP send fails for any reason, the error is logged server-side and swallowed — the action still returns the same generic `{ ok: true }` response it always has. This preserves the existing account-enumeration protection (the response must never reveal whether a send succeeded, failed, or never happened because the email wasn't registered) and keeps the request from crashing on a transient SMTP hiccup.

**Email format:** Simple branded HTML with a plain-text fallback (multipart). No external images or webfonts — inline styles only, matching the app's cream background / deep muted-green accent — keeps it lightweight and avoids deliverability issues from external asset loads.

## Components

### `src/lib/mailer.ts` (new)

- `createMailer(): Mailer` — builds a real `nodemailer` SMTP transport from env vars (`GMAIL_USER`, `GMAIL_APP_PASSWORD`). Called once, at the call site in the server action (not at module load), so tests never construct a real transport.
- `type Mailer = Pick<nodemailer.Transporter, "sendMail">` — the minimal shape needed, so tests can inject a mock object without importing nodemailer's real transport machinery. This mirrors the existing `Pick<PrismaClient, ...>` dependency-injection pattern already used throughout `src/lib/*.ts`.
- `sendPasswordResetEmail(mailer: Mailer, to: string, resetUrl: string): Promise<void>` — builds the message (subject, html, text, from) using the templates below and calls `mailer.sendMail(...)`. Throws on failure — the caller (the server action) is responsible for catching and logging.

### `src/lib/email-templates/password-reset.ts` (new)

- `passwordResetEmailHtml(resetUrl: string): string` — returns an inline-styled HTML string. Must contain the literal `resetUrl` inside an `<a href="...">`.
- `passwordResetEmailText(resetUrl: string): string` — plain-text fallback, must contain the literal `resetUrl`.
- Both are pure functions of their input — fully unit-testable with string assertions, no mocking needed.

### `src/actions/password-reset.actions.ts` (modify)

`requestPasswordResetAction` currently does:

```typescript
if (result) {
  const baseUrl = process.env.APP_URL ?? "http://localhost:3000";
  const resetUrl = `${baseUrl}/reset-password?token=${result.token}`;
  console.log(`[password reset] ${resetUrl}`); // dev-mode placeholder for real email sending
}
```

This becomes:

```typescript
if (result) {
  const baseUrl = process.env.APP_URL ?? "http://localhost:3000";
  const resetUrl = `${baseUrl}/reset-password?token=${result.token}`;
  try {
    const mailer = createMailer();
    await sendPasswordResetEmail(mailer, parsed.data.email, resetUrl);
  } catch (err) {
    console.error("[password reset] failed to send email", err);
  }
}
```

The function's return value and the generic "check your email" UI copy do not change.

## Config

New required env vars (`.env.example`, documented in `docs/ARCHITECTURE.md`):

```
GMAIL_USER="your-address@gmail.com"
GMAIL_APP_PASSWORD="16-character App Password from Google Account > Security > App Passwords (requires 2-Step Verification enabled)"
```

`APP_URL` (already present) continues to build the reset link — unchanged.

## One-time manual setup (user, not Claude)

1. Enable 2-Step Verification on the Gmail account that will send these emails.
2. Generate an App Password: Google Account → Security → 2-Step Verification → App Passwords → generate one for "Mail".
3. Put the Gmail address and the generated 16-character password into `.env` as `GMAIL_USER` / `GMAIL_APP_PASSWORD`.

This is documented in `docs/ARCHITECTURE.md` as part of this plan's implementation, but the actual account changes happen outside this codebase and are the user's to perform.

## Testing

- `src/lib/email-templates/password-reset.test.ts` — asserts both template functions embed the given `resetUrl`, and that the HTML is valid enough to contain an `<a href>` tag wrapping it.
- `src/lib/mailer.test.ts` — tests `sendPasswordResetEmail` against a mock `Mailer` (`{ sendMail: vi.fn() }`), asserting the mock was called with the right `to`, a non-empty `subject`, and `html`/`text` containing the reset URL. Also a test that a rejected `sendMail` promise propagates (throws) — the try/catch is the *action's* responsibility, not the mailer's.
- `src/actions/password-reset.actions.test.ts` (new or extended, mirroring the existing action test setup) — asserts that when the mailer throws, the action still resolves `{ ok: true }` and does not throw.
- No test constructs a real SMTP transport or makes a real network call. `createMailer()` itself (the only piece that touches real nodemailer transport construction) is intentionally trivial and left uncovered by unit tests, the same way `src/lib/prisma.ts`'s real client construction is not unit-tested — it's a thin wiring function, verified instead by manual/integration testing.

## Manual verification (post-implementation)

With real `GMAIL_USER`/`GMAIL_APP_PASSWORD` set in `.env`:
1. Request a password reset for the demo account's real inbox (or a test inbox you control).
2. Confirm the email actually arrives, the link works end-to-end (same walkthrough as Plan 5's original browser verification).
3. Confirm an SMTP auth failure (e.g., temporarily wrong app password) is logged to the server console but the UI still shows the generic success message.

## Out of scope

- No queueing/retry system for failed sends — a single attempt, logged on failure, is enough for a personal-project scale.
- No email verification / welcome emails — this spec is password-reset only.
- No support for other providers (Resend, SES, etc.) — Gmail SMTP only, per user's explicit choice for this pass.
