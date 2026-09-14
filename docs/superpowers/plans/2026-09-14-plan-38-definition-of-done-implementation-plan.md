# Plan-38 Definition-of-Done Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close out plan-38 with its own §14 ask — a final audit of §1–§13 against the current codebase, one combined verification sweep, and a completion report.

**Architecture:** Each task is a concrete, reproducible check (an exact command plus what result confirms it) against one or more of plan-38's original 14 requirement areas — no application code changes are planned, only the report they feed into.

**Tech Stack:** grep/read-based codebase audit, the project's existing Vitest/Playwright/ESLint/tsc/`next build` toolchain.

**Spec:** `docs/superpowers/specs/2026-09-14-plan-38-definition-of-done-design.md`

---

### Task 1: Audit §1 (shared source of truth) and §13 (invariants)

**Files:** none — read-only audit.

- [ ] **Step 1: Confirm multi-record mutations are transaction-wrapped**

Run: `grep -n "prisma.\$transaction" src/lib/payables.ts src/actions/transaction.actions.ts src/lib/receipts.ts`
Expected: at least one match in each file (transfer/credit-card-payment paths in `transaction.actions.ts`, `markPayablePaid` in `payables.ts`, `confirmReceipt` in `receipts.ts`)

- [ ] **Step 2: Confirm the enriched suggested-transfer shape**

Run: `grep -n "reason\|obligations\|remainingBalance" src/lib/transfer-recommendations.ts`
Expected: all three fields present in the returned type

- [ ] **Step 3: Confirm named invariant tests exist**

Run: `grep -rln "restricted.fund\|transfer.*exclu\|credit.card.*double" src/lib/*.test.ts -i`
Expected: at least one matching test file for the restricted-fund "all unpaid payables" case and the transfer/credit-card-payment exclusion cases named in §13

- [ ] **Step 4: Record the finding**

Note the result of each step (pass/gap) for use in Task 8's report — no code changes regardless of outcome, per the spec's non-goals.

---

### Task 2: Re-confirm §4, §7, §8, §10 (design tokens, nav redesign, sign-out fix, form fields)

**Files:** none — read-only audit.

- [ ] **Step 1: Design tokens (§4)**

Run: `grep -n "^\s*--primary:" src/app/globals.css`
Expected: two matches (light and dark mode), light mode `#721D42`

- [ ] **Step 2: Nav redesign (§7)**

Run: `grep -n "motion-reduce\|hover:translate\|gradient" src/components/nav/side-nav.tsx`
Expected: matches for the gradient background, hover-lift, and `motion-reduce:` variants

- [ ] **Step 3: Sign-out fix (§8)**

Run: `grep -n "SignOutButton collapsed" src/components/nav/side-nav.tsx`
Expected: one match — the collapsed state is passed through, not left to float unadapted

- [ ] **Step 4: Form fields (§10)**

Run: `grep -n "shadow-\[inset\|dark:shadow-\[inset" src/components/ui/input.tsx src/components/ui/textarea.tsx`
Expected: both files show the raised inset-shadow treatment in both modes

- [ ] **Step 5: Record the finding**

Note the result of each step for Task 8's report.

---

### Task 3: Deeper pass on §5/§6 (card/color audit)

**Files:** none — read-only audit.

The design spec flags this as needing a real pass rather than a partial spot-check — checks every current top-level page area for the semantic color tokens (`expense-accent`/`expense-surface`, `savings-accent`/`savings-surface`, `restricted-accent`/`restricted-surface`, and income's equivalent, `success`/`success-background`, per `globals.css`).

- [ ] **Step 1: Tally token usage across every page area**

Run: `grep -rl "expense-accent\|expense-surface\|savings-accent\|savings-surface\|restricted-accent\|restricted-surface\|success-background" src/app/\(app\) src/components`
Expected: a list of files — record which of the 12 page areas (`accounts`, `audit-log`, `bills`, `budget`, `calendar`, `dashboard`, `loans-cards`, `reports`, `settings`, `shopping`, `transactions`, `year-plan`) have at least one match, either directly or via a shared component they render (e.g. `TransactionList`, `Card`)

- [ ] **Step 2: Spot-check every page area for the semantic colors, direct or inherited**

For each of the 12 areas, run its own command — a page with no *direct* token match in Step 1 needs this to confirm it still gets the palette indirectly through a shared component (e.g. `TransactionList`/`Card`), not that it was missed entirely:

```bash
grep -rn "success\|danger\|warning" "src/app/(app)/accounts/page.tsx" src/components/accounts/
grep -rn "success\|danger\|warning" "src/app/(app)/audit-log/page.tsx" src/components/audit-log/
grep -rn "success\|danger\|warning" "src/app/(app)/bills/page.tsx" src/components/bills/
grep -rn "success\|danger\|warning" "src/app/(app)/budget/page.tsx" src/components/budget/
grep -rn "success\|danger\|warning" "src/app/(app)/calendar/page.tsx" src/components/calendar/
grep -rn "success\|danger\|warning" "src/app/(app)/dashboard/page.tsx" src/components/dashboard/
grep -rn "success\|danger\|warning" "src/app/(app)/loans-cards/page.tsx" src/components/loans-cards/
grep -rn "success\|danger\|warning" "src/app/(app)/reports/page.tsx" src/components/reports/
grep -rn "success\|danger\|warning" "src/app/(app)/settings/page.tsx" src/components/settings/
grep -rn "success\|danger\|warning" "src/app/(app)/shopping/page.tsx" src/components/shopping/
grep -rn "success\|danger\|warning" "src/app/(app)/transactions/page.tsx" src/components/transactions/
grep -rn "success\|danger\|warning" "src/app/(app)/year-plan/page.tsx" src/components/year-plan/
```

Expected: every command returns at least one match — either directly on the page or in a component it renders. Any area returning zero matches across both Step 1 and this step is a genuine gap for the report.

- [ ] **Step 3: Record the finding**

List which pages get the semantic palette directly, which get it via a shared component, and any genuine gap found — for Task 8's report. No code changes regardless of outcome.

---

### Task 4: Re-confirm §9 (dropdown dark-mode)

**Files:** none — read-only audit.

- [ ] **Step 1: Confirm the two existing portal-based overlay components are token-driven**

Run: `grep -n "dark:" src/components/ui/select.tsx src/components/ui/dialog.tsx`
Expected: `dark:` variants present in both

- [ ] **Step 2: Confirm no new portal-based overlay component has been added since**

Run: `find src/components/ui -iname "*dropdown*" -o -iname "*popover*" -o -iname "*command*"`
Expected: no results — if any exist, they need the same `dark:` check Step 1 ran, and that finding goes in the report instead of silently passing

- [ ] **Step 3: Record the finding**

For Task 8's report.

---

### Task 5: Re-confirm §11 (audit history)

**Files:** none — read-only audit.

- [ ] **Step 1: Confirm `recordAudit` is wired broadly, not just in one place**

Run: `grep -rc "recordAudit" src/lib src/actions | grep -v ":0"`
Expected: multiple files across both `lib` and `actions`, not concentrated in a single mutation path

- [ ] **Step 2: Record the finding**

For Task 8's report.

---

### Task 6: Document the three known gaps (§2, §3, §12)

**Files:** none — no new investigation needed, these were already confirmed with the user during brainstorming.

- [ ] **Step 1: Write down the exact gap for each, ready to paste into Task 8's report**

- **§2 (Stage I, voice approval):** shipped a hands-free dictate/auto-parse/voice-approve loop (`confirm`/`cancel`/`undo` synonyms), not the originally-specified phrase list ("Approve and save," "Mark this as paid," etc.); undo remains scoped to Quick-Capture-confirmed drafts, not extended to manually-created records. Closing it would mean adding the specific phrases as additional matches in `matchApprovalCommand` and building an undo path for manual `Transaction`/`Payable` edits.
- **§3 (Stage H, receipt aliases):** shipped one alias tier (raw text → catalog item/store, learn-on-correction), not the specified confidence tiers (saved names → merchant aliases → past corrections → size/price/similarity) or a receipt-side clarification-question UX. Closing it would mean layering the additional tiers into `resolveAlias`'s candidate-matching and adding a clarification prompt to the receipt review screen.
- **§12 (Stage J, testing):** shipped 4 e2e smoke tests (login, add-transaction, Quick Capture, shopping-list), not the specified 20 journeys — a scope you and I deliberately chose together at the time. Closing it would mean writing e2e specs for the remaining page areas (accounts, budget, bills, calendar, loans-cards, reports, settings, audit-log, year-plan) following the same `e2e/*.spec.ts` pattern.

---

### Task 7: Full combined verification sweep

**Files:** none — verification only.

- [ ] **Step 1: Full Vitest suite**

Run: `npx vitest run`
Expected: every test file passes

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Lint**

Run: `npx eslint src e2e`
Expected: no new errors (the 4 pre-existing unrelated warnings are fine)

- [ ] **Step 4: Full Playwright e2e suite**

Run: `npx playwright test`
Expected: all 4 tests pass

- [ ] **Step 5: Production build**

Run: `npx next build`
Expected: succeeds, all routes registered

- [ ] **Step 6: Reset the demo account**

Run: `npm run db:seed-demo`
Expected: succeeds — leaves the demo account clean after the e2e run touched it

---

### Task 8: Write the completion report

**Files:**
- Create: `docs/superpowers/plans/2026-09-14-plan-38-completion-report.md`

- [ ] **Step 1: Write the report**

Structure it as:
- A one-paragraph summary: plan-38 spanned Stages A–K across this and prior sessions; all 14 requirement areas are addressed, 11 fully and 3 with an explicitly accepted scope reduction.
- A table: `§` | requirement area | delivering stage | status (Done / Done with noted gap) | evidence (the command from Tasks 1–5 that confirmed it)
- The three gap write-ups from Task 6, verbatim
- The Task 7 verification sweep's results (pass/fail per step, with actual numbers — e.g. test counts)
- A closing statement confirming plan-38 is complete under the scope decisions made along the way

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/plans/2026-09-14-plan-38-completion-report.md
git commit -m "docs: add the plan-38 completion report (Stage K)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```
