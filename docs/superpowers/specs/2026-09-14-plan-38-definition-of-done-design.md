# Plan-38 Definition-of-Done Pass — Design

**Goal:** Close out plan-38 (`docs/superpowers/plans/2026-09-13-plan-38-financial-integrity-and-polish-staged-plan.md`) with §14's own two-part ask: "a process checklist to apply per-stage... and a final completion report once all stages are done." Stages A–J have each already run their own per-stage checklist; Stage K is the one-time final pass and report.

**Context:** This is a documentation/verification deliverable, not new application code. Stages A–G were spot-checked during brainstorming and confirmed genuinely delivered (transaction wrapping, enriched transfer recommendations, the new color palette, the sign-out fix, nav motion/tooltips, raised form-field styling). Stages H, I, and J have known, already-discussed gaps against plan-38's original §2/§3/§12 asks — per your explicit decision, this pass documents them as accepted scope reductions rather than reopening those stages.

---

## 1. Audit tasks (§1–§13 against the current codebase)

Each of the 13 substantive requirement areas gets a concrete, groundable check — not a re-read of memory:

- **§1 (shared source of truth):** confirmed already — `prisma.$transaction` wraps `payables.ts`, `transaction.actions.ts`'s transfer/credit-card-payment paths; `transfer-recommendations.ts` returns `reason`/`obligations`/`remainingBalance`. Re-confirm the restricted-fund "all unpaid payables" test exists by name.
- **§2 (voice approval), §3 (receipt aliases), §12 (testing):** no new checking needed — gaps already identified and confirmed with you (Stage I's phrase list/manual-record undo, Stage H's confidence tiers/clarification UX, Stage J's 4-vs-20 journeys).
- **§4 (design tokens):** confirmed already — `globals.css`'s `--primary` matches the requested hex in both modes.
- **§5/§6 (card/color audit):** needs a real pass — grep every page §5 originally named for the semantic `*-surface`/`*-accent` token classes (`expense-accent`, `savings-accent`, `restricted-accent`, income's equivalent), not assumed from a partial spot-check.
- **§7 (nav redesign):** confirmed already — gradient, `motion-reduce:` variants, hover-lift all present in `side-nav.tsx`.
- **§8 (sign-out bug):** confirmed already — `SignOutButton` receives `collapsed`.
- **§9 (dropdown dark-mode):** re-confirm `select.tsx`/`dialog.tsx` are token-driven with `dark:` variants, and that no new portal-based overlay component (dropdown-menu/command/popover) has been added since that would need the same check.
- **§10 (form fields):** confirmed already — `input.tsx` has the inset shadow and `dark:` variant from Stage F.
- **§11 (audit history):** confirmed already — `recordAudit` is called from 13 files across `lib`/`actions`.

## 2. Final combined verification sweep

Every check that has passed individually, per-stage, run together in one final pass: `npx vitest run`, `npx tsc --noEmit`, `npx eslint src e2e`, `npx playwright test`, `npx next build`.

## 3. The completion report

A new doc, `docs/superpowers/plans/2026-09-14-plan-38-completion-report.md` — a table mapping each of §1–§14 to the stage that delivered it and its status (Done / Done with noted gap), the three gaps named explicitly with a one-line "what would close it" note each (not a commitment to do so), the final verification sweep's results, and a closing statement. Committed alongside the audit findings.

## Non-goals

- No application code changes, unless the §5/§6/§9 re-checks turn up something genuinely broken — in which case it's named in the report, not silently fixed (matches your "audit + report only" choice).
- Not reopening Stages H, I, or J.
- No new tests written — the verification sweep only runs what already exists.
