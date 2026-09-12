# Plan 4.2: Docs & Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The second half of Plan 4 (Portfolio presentation) — a real README and architecture doc, actual screenshots, a documented Postgres deployment path, and an accessibility/responsive pass over the brand palette Plan 3B.4a introduced.

**What this plan found, and why it's needed:** Rather than leave "accessibility review" as a vague audit-and-see, the WCAG contrast math was run against the actual hex values Plan 3B.4a chose. Every accent preset's button text fails WCAG AA (4.5:1 for normal text) against its own `--primary` background except `neutral`:

| Accent | white text on it | dark text on it |
|---|---|---|
| coral `#ff6b5e` | 2.79:1 ❌ | 5.48:1 ✅ |
| blue `#3b82f6` | 3.68:1 ❌ | 4.16:1 ❌ |
| green `#16a34a` | 3.30:1 ❌ | 4.64:1 ✅ (barely) |
| purple `#8b5cf6` | 4.23:1 ❌ | 3.62:1 ❌ |
| neutral `#52525b` | 7.73:1 ✅ | 1.98:1 ❌ |

No single foreground color choice fixes all five — coral, blue, and purple sit at different points on the luminance scale that no single fix (just changing the text color) resolves for all of them at once. So the fix is two-part: **coral** switches its button text to the app's dark foreground color (dark-on-light-coral clears 4.5:1 comfortably); **blue**, **green**, and **purple** each get very slightly darkened (kept clearly recognizable as "blue"/"green"/"purple", not a different hue) so white text clears 4.5:1 against them too; **neutral** is already fine and unchanged. Verified darkened values:

| Accent | new hex | white text on it |
|---|---|---|
| blue | `#2563eb` | 5.17:1 ✅ |
| green | `#15803d` | 5.02:1 ✅ |
| purple | `#7c3aed` | 5.70:1 ✅ |

**Architecture:** No schema changes, no new domain logic — this plan is CSS, documentation, and verification. The one code change (the contrast fix) is scoped tightly to `globals.css`'s `[data-accent="..."]` blocks; nothing about how accent selection itself works changes.

**Tech Stack:** No new dependencies for the app itself. Screenshot capture during verification may use whatever browser automation is available in the session (not a project dependency).

**Read first:** `src/app/globals.css` (the `[data-accent="..."]` blocks this plan edits); `docs/superpowers/specs/2026-09-12-budget-tracker-design.md` (source material to condense into the architecture doc — don't re-derive decisions already written there, summarize them); `package.json` (tech stack list for the README); `prisma/schema.prisma` (the Postgres-portability note — this schema was written from the start to not require a rewrite when switching datasources, per the design spec).

**Scope boundary — explicitly NOT in this plan:** the spec's distinct mobile nav (Home/Transactions/Add/Bills/Accounts + a "More" menu) — already deferred once in Plan 3B.4b as a larger, separate responsive-navigation feature; this plan's responsive pass is limited to making sure nothing actively breaks (overlapping text, horizontal page scroll) at narrow widths, not building the spec'd mobile IA. Actually deploying anywhere (Vercel, a Postgres instance, etc.) — this plan documents the path, it doesn't execute a deployment.

---

### Task 1: Fix the accent-preset contrast failures

**Files:**
- Modify: `src/app/globals.css`

- [ ] **Step 1: Darken blue, green, and purple; switch coral's button text to dark**

In the `[data-accent="..."]` blocks (added in Plan 3B.4a, right after the `.dark` block), replace:

```css
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

with:

```css
[data-accent="coral"] {
  --primary: #ff6b5e;
  --primary-foreground: #2b241c; /* white failed WCAG AA here (2.79:1) — dark text clears it (5.48:1) */
  --ring: #ff6b5e;
}
[data-accent="blue"] {
  --primary: #2563eb; /* darkened from #3b82f6 — that shade failed AA with either white or dark text */
  --primary-foreground: #ffffff; /* 5.17:1 */
  --ring: #2563eb;
}
[data-accent="green"] {
  --primary: #15803d; /* darkened from #16a34a for the same reason */
  --primary-foreground: #ffffff; /* 5.02:1 */
  --ring: #15803d;
}
[data-accent="purple"] {
  --primary: #7c3aed; /* darkened from #8b5cf6 for the same reason */
  --primary-foreground: #ffffff; /* 5.70:1 */
  --ring: #7c3aed;
}
[data-accent="neutral"] {
  --primary: #52525b;
  --primary-foreground: #ffffff; /* already fine (7.73:1) — unchanged */
  --ring: #52525b;
}
```

- [ ] **Step 2: Update the accent swatch hex values shown in the picker to match**

The swatch color shown in `ACCENT_COLORS` (`src/lib/constants/appearance.ts`) should match what selecting that preset actually applies, so the picker doesn't show a slightly different shade than what the UI switches to. Update:

```typescript
export const ACCENT_COLORS = [
  { value: "coral", label: "Coral", swatch: "#ff6b5e" },
  { value: "blue", label: "Blue", swatch: "#3b82f6" },
  { value: "green", label: "Green", swatch: "#16a34a" },
  { value: "purple", label: "Purple", swatch: "#8b5cf6" },
  { value: "neutral", label: "Neutral", swatch: "#71717a" },
] as const;
```

to:

```typescript
export const ACCENT_COLORS = [
  { value: "coral", label: "Coral", swatch: "#ff6b5e" },
  { value: "blue", label: "Blue", swatch: "#2563eb" },
  { value: "green", label: "Green", swatch: "#15803d" },
  { value: "purple", label: "Purple", swatch: "#7c3aed" },
  { value: "neutral", label: "Neutral", swatch: "#52525b" },
] as const;
```

(`coral`'s swatch is unchanged — only its button *text* color changed, not the hue itself. `neutral`'s swatch changes from `#71717a` to `#52525b` to match `globals.css`'s `--primary` value for that preset exactly, which it never quite did before this plan.)

- [ ] **Step 3: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "fix: darken blue/green/purple accents and switch coral's button text to dark, fixing WCAG AA contrast failures"
```

---

### Task 2: Responsive nav pass and keyboard-navigation spot check

**Files:**
- Modify: `src/components/nav/top-nav.tsx`

- [ ] **Step 1: Make the nav horizontally scrollable instead of wrapping**

At narrow widths, the current nav (a `flex` row of 8 links plus the app name and action buttons) wraps onto multiple lines, which can overlap or crowd the header. Building the design spec's full separate mobile nav (Home/Transactions/Add/Bills/Accounts + a "More" menu) is out of scope here (see this plan's scope boundary) — this step's job is narrower: make sure nothing actively breaks. Change the `<nav>` element in `src/components/nav/top-nav.tsx` from:

```typescript
<nav className="flex items-center gap-4 text-sm">
```

to:

```typescript
<nav className="flex items-center gap-4 overflow-x-auto text-sm">
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Browser-verify the nav at a narrow viewport**

With the dev server running, resize the browser viewport to a typical phone width (e.g. 375px) and visit any authenticated page. Confirm the nav no longer wraps onto multiple lines — instead it scrolls horizontally within its own row, and the page itself doesn't gain a horizontal scrollbar (only the nav strip does). If it still wraps or the page scrolls horizontally, that's a real bug to fix here (e.g. the header's flex container may also need `min-w-0` or the nav needs `flex-nowrap` — diagnose and fix before moving on).

- [ ] **Step 4: Keyboard-navigation spot check on a dialog**

Open any dialog in the app (e.g. the Accounts page's "Add account" dialog). Confirm:
- Tab moves focus through the dialog's fields in order and doesn't escape to the page behind it (focus trap).
- Escape closes the dialog.
- Enter (with focus in the last field or on the Save button) submits the form.

This project's dialogs are all built on the shared `src/components/ui/dialog.tsx` wrapper over Base UI's `Dialog` primitive, which provides this behavior by default — this step is a verification pass, not expected to require a code change. If something doesn't work as described, that's a real bug — fix it in `src/components/ui/dialog.tsx` (the one shared wrapper every dialog in the app uses) rather than per-dialog.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "fix: make the top nav horizontally scrollable instead of wrapping at narrow widths"
```

(If Step 4 required no code change, this commit covers Steps 1–3 only — that's expected, not a gap.)

---

### Task 3: Capture real screenshots

**Files:**
- Create: `docs/screenshots/landing.png`, `docs/screenshots/dashboard.png`, `docs/screenshots/bills.png`, `docs/screenshots/reports.png`, `docs/screenshots/settings.png`

- [ ] **Step 1: Reset the demo account to a clean state**

Log in as `demo@example.com` / `demopassword123` and use Settings → Demo data → "Reset demo data" (built in Plan 4.1) to guarantee the screenshots below show the intended fictional dataset, not whatever was left over from other verification passes.

- [ ] **Step 2: Capture each page**

Using whatever browser automation is available in your session (a screenshot tool that writes an actual image file to disk, not just a token/context preview), capture, at a standard desktop width (~1280px):

- The public landing page (signed out) → `docs/screenshots/landing.png`
- The Dashboard (signed in as the demo account) → `docs/screenshots/dashboard.png`
- The Bills page → `docs/screenshots/bills.png`
- The Reports page (with the demo transactions actually populating both charts) → `docs/screenshots/reports.png`
- The Settings page → `docs/screenshots/settings.png`

Each file should be a real PNG saved into `docs/screenshots/`, not a placeholder — the README (Task 4) embeds these directly.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "docs: add portfolio screenshots"
```

---

### Task 4: Rewrite the README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Replace the stock create-next-app README**

Write a real README covering, in order:

1. **Title and one-line description** — what this app is (a budget tracker built around a custom pay-cycle instead of the calendar month), and a link/mention of the live demo if one exists.
2. **Screenshots** — embed the five images from Task 3 with short captions, e.g.:

   ```markdown
   ![Dashboard](docs/screenshots/dashboard.png)
   ```

3. **Core differentiators** — the same list already written for the landing page (`src/app/page.tsx`'s `DIFFERENTIATORS`), reused here so the README and the in-app pitch don't drift apart. Don't re-derive this list from scratch — copy it from that file.
4. **Tech stack** — Next.js (App Router), Tailwind CSS, shadcn/ui (Base UI primitives, not Radix), Prisma + SQLite (with a note that the schema is Postgres-portable — see Architecture doc), Auth.js v5, zod + react-hook-form, Vitest.
5. **Getting started** — clone, `npm install`, `.env` setup (point at `.env.example`), `npm run db:push`, `npm run db:demo-user`, `npm run db:seed-demo`, `npm run dev`.
6. **This machine's environment quirk** — briefly note (a sentence or two, not the full history) that this specific dev environment's Application Control policy blocks native `.exe` binaries downloaded by npm, which is why `dev`/`build` force `--webpack` over Turbopack and why schema changes go through `prisma/schema.sql` + `npm run db:push` instead of `prisma db push` directly — and that neither workaround is needed on a normal machine/deployment target.
7. **Testing** — `npm test`, and a one-line note on the testing philosophy (dependency-injected domain functions tested against mocked Prisma clients).
8. **License/status** — whatever's appropriate (e.g. "personal portfolio project").

Keep the whole thing readable in one sitting — this is a portfolio artifact, not exhaustive documentation (that's what the Architecture doc, Task 5, is for).

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "docs: rewrite README for portfolio presentation"
```

---

### Task 5: Write the architecture doc

**Files:**
- Create: `docs/ARCHITECTURE.md`

- [ ] **Step 1: Write it**

Condense (don't copy verbatim) `docs/superpowers/specs/2026-09-12-budget-tracker-design.md` into a shorter, public-facing architecture document covering:

1. **Layering** — the domain-function → server-action → page/component pattern used throughout (`src/lib/*.ts` dependency-injected functions tested against mocked Prisma clients, called from thin `"use server"` actions in `src/actions/*.ts`, rendered by server components).
2. **Money representation** — integer minor units, not `Decimal`, and why (link back to the design spec's reasoning briefly, don't re-litigate it at length).
3. **The budget cycle** — one sentence on what a custom `cycleStartDay` means, one worked example (reuse one from the design spec, e.g. `cycleStartDay = 11`), and that `src/lib/cycle.ts` is the single source of this math.
4. **The transaction/transfer model** — every row is a self-contained signed ledger entry against its own `accountId`; a transfer is two linked rows, not one row affecting two balances; only a transfer fee is a real expense.
5. **Account-balance rule** — `balance = openingBalance + sum(amount)`, computed, never stored redundantly; liquid funds excludes `CREDIT_CARD`/`LOAN` account types as a hard rule.
6. **Recurring items never auto-post** — a `RecurringRule`/`RecurringPayable`'s due date reaching today only surfaces it for confirm/skip; nothing posts a transaction without that explicit step. Installment purchases are the one exception that generates its whole schedule up front, and why (Plan 3B.2's reasoning: the schedule is fully known at creation time, unlike a recurring rule's open-ended cadence).
7. **Reconciliation never silently overwrites** — preview the calculated-vs-actual difference, only write a `BALANCE_ADJUSTMENT` transaction on explicit confirmation.
8. **Deployment path** — this schema was written from the start to not require a rewrite when switching Prisma's datasource from SQLite to Postgres (per the original design spec's stated intent). Note what actually changes to do that: the `datasource db` block in `prisma/schema.prisma` (`provider = "postgresql"`, a real `DATABASE_URL`), swapping `@prisma/adapter-better-sqlite3` for a Postgres-compatible driver adapter (or Prisma's default engine, since the schema-engine-binary constraint documented in the README is specific to this dev machine, not Postgres or production deployment generally), and re-running the schema against the new database — `prisma/schema.sql` is this project's own hand-maintained mirror for this machine's `db:push` workaround, not something a normal deployment target needs at all.

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "docs: add architecture overview"
```

---

### Task 6: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

```bash
npm test
```

Expected: all 208 existing tests still pass — this plan adds no new domain logic.

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Browser walkthrough**

Start the dev server (fresh restart recommended, given this session's recurring stale-webpack-cache issue after structural changes) and verify:

- Switch through all 5 accent presets in Settings → Appearance and confirm every button/underline/focus ring is comfortably readable in both light and dark mode — no accent should look "washed out" or hard to read now.
- Confirm the nav no longer visibly wraps at a narrow viewport (per Task 2), and that a dialog's Tab/Escape/Enter behavior works as expected.
- Open `README.md` and `docs/ARCHITECTURE.md` as rendered Markdown (not just plain text) and confirm the screenshots actually display (broken image paths are a common mistake — check the relative paths resolve from the repo root).
- Reset the demo account back to a clean state if any of this verification pass left it in a modified condition (e.g. if you changed its accent/theme while checking presets).

- [ ] **Step 4: Confirm a clean working tree**

```bash
git status --short
```

Expected: no output (everything already committed; verification found no code changes needed, or any fix was committed above).
