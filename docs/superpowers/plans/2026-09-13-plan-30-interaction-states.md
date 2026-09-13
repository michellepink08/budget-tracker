# Interaction States Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Phase 20.3 of the visual-design roadmap — give every clickable element a visible hover *and* keyboard-focus state, per the design system's explicit rule.

**Scope correction from the roadmap doc:** `plan-20`'s Phase 20.3 description assumed account/transaction/upcoming-item **rows** were clickable-as-a-whole and needed the `Card` component's `interactive` variant. Inspecting the actual code (done for this plan) shows that's not the case: every one of those rows is a plain informational container whose *children* (Edit/Reconcile/Archive/Confirm/Delete — all already the shared `Button` component, which already has `hover:`/`focus-visible:`/`active:` states built into its `cva` definition) are the real click targets. Applying `interactive` to the row itself would make a non-clickable container *look* clickable — exactly the thing the design system explicitly forbids ("static informational cards must not look clickable"). So `Card`'s `interactive` variant stays defined (Task 1 of Phase 20.2 already built it) but **unapplied** until a future feature (Year Plan, Shopping, Calendar) has an actual whole-row click target — nothing in this phase forces it in early.

What genuinely *is* missing, found by grepping every raw `<button>`/`<Link>` in the app for `focus-visible`: the nav (`SideNav`, `TopNav`, `NavDrawer`), several hand-styled buttons that don't use the shared `Button` component (theme picker, transaction-type toggle, export submit, Quick Capture's example/Undo/View links), all render with a hover state but **no visible keyboard-focus ring at all**. This phase fixes exactly those.

**Architecture:** No new components. `Button` and `Card`'s `interactive` variant already provide the right CSS; this phase applies focus-visible treatment directly to the handful of raw elements that bypass those components, and converts one raw button (`export-settings.tsx`'s submit) to the shared `Button` where a straight swap is possible.

**Tech Stack:** Tailwind utility classes only.

---

### Task 1: Nav focus states (dark nav background — needs a light-on-dark ring, not the default `ring-ring`)

**Files:**
- Modify: `src/components/nav/side-nav.tsx`
- Modify: `src/components/nav/top-nav.tsx`

No test file — presentational only.

- [ ] **Step 1: `side-nav.tsx`'s collapse toggle button**

```tsx
          className="shrink-0 rounded-md p-1 text-[var(--nav-foreground)]/70 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--nav-foreground)]/60"
```

- [ ] **Step 2: `side-nav.tsx`'s Quick Capture trigger button**

```tsx
        className="mx-2 mt-2 rounded-md border border-white/15 px-3 py-2 text-left text-sm text-[var(--nav-foreground)]/70 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--nav-foreground)]/60"
```

- [ ] **Step 3: `side-nav.tsx`'s nav `Link`s**

```tsx
              className={
                (isActive ? "bg-white/15 font-medium" : "text-[var(--nav-foreground)]/80 hover:bg-white/10") +
                " flex items-center gap-2 rounded-md px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--nav-foreground)]/60"
              }
```

- [ ] **Step 4: `top-nav.tsx`'s hamburger and Quick Capture buttons**

```tsx
          className="rounded-md p-1 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--nav-foreground)]/60"
```

applied to both buttons in that file.

- [ ] **Step 5: Typecheck and lint**

Run: `npx tsc --noEmit && npx eslint src/components/nav/side-nav.tsx src/components/nav/top-nav.tsx`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/nav/side-nav.tsx src/components/nav/top-nav.tsx
git commit -m "fix(design): add visible keyboard-focus rings to the nav

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: `NavDrawer`'s nav links (light dialog surface — the standard `ring-ring` applies here)

**Files:**
- Modify: `src/components/nav/nav-drawer.tsx`

- [ ] **Step 1: Add focus-visible to the drawer's nav `Link`s**

```tsx
                className={
                  (isActive ? "bg-muted font-medium" : "hover:bg-muted") +
                  " flex items-center gap-3 rounded-md px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                }
```

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit && npx eslint src/components/nav/nav-drawer.tsx`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/nav/nav-drawer.tsx
git commit -m "fix(design): add a visible keyboard-focus ring to the mobile nav drawer

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Quick Capture's example/Undo/View links

**Files:**
- Modify: `src/components/quick-capture/quick-capture-panel.tsx`

- [ ] **Step 1: Example-command buttons**

```tsx
                <button
                  key={example}
                  type="button"
                  className="rounded-sm text-left underline hover:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  onClick={() => setText(example)}
                >
```

- [ ] **Step 2: "Undo" button**

```tsx
                    <button
                      type="button"
                      className="rounded-sm underline hover:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      onClick={() => handleUndo(index)}
                    >
                      Undo
                    </button>
```

- [ ] **Step 3: "View" button**

```tsx
                  <button
                    type="button"
                    className="rounded-sm underline hover:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    onClick={() => {
                      handleOpenChange(false);
                      router.push("/transactions");
                    }}
                  >
                    View
                  </button>
```

- [ ] **Step 4: Typecheck and lint**

Run: `npx tsc --noEmit && npx eslint src/components/quick-capture/quick-capture-panel.tsx`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/quick-capture/quick-capture-panel.tsx
git commit -m "fix(design): add hover/focus states to Quick Capture's text links

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Theme picker, transaction-type toggle, and export submit button

**Files:**
- Modify: `src/components/settings/appearance-settings.tsx`
- Modify: `src/components/transactions/transaction-form.tsx`
- Modify: `src/components/settings/export-settings.tsx`

- [ ] **Step 1: `appearance-settings.tsx`'s theme-mode buttons — add focus-visible and an inactive hover state**

```tsx
              className={
                themeMode === mode
                  ? "rounded-md border-2 border-primary px-3 py-1.5 text-sm capitalize focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  : "rounded-md border-2 border-transparent px-3 py-1.5 text-sm capitalize text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              }
```

- [ ] **Step 2: `transaction-form.tsx`'s Transaction/Transfer toggle — add focus-visible and an inactive hover state**

```tsx
        <button
          type="button"
          onClick={() => setIsTransfer(false)}
          className={`rounded-md border px-3 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${!isTransfer ? "bg-secondary" : "hover:bg-muted"}`}
        >
          Transaction
        </button>
        <button
          type="button"
          onClick={() => setIsTransfer(true)}
          className={`rounded-md border px-3 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${isTransfer ? "bg-secondary" : "hover:bg-muted"}`}
        >
          Transfer
        </button>
```

- [ ] **Step 3: `export-settings.tsx`'s submit button — swap to the shared `Button` component instead of hand-styling**

Add the import:

```ts
import { Button } from "@/components/ui/button";
```

Replace:

```tsx
      <button
        type="submit"
        className="self-start rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/80"
      >
        Export
      </button>
```

with:

```tsx
      <Button type="submit" className="self-start">
        Export
      </Button>
```

- [ ] **Step 4: Typecheck and lint**

Run: `npx tsc --noEmit && npx eslint src/components/settings/appearance-settings.tsx src/components/transactions/transaction-form.tsx src/components/settings/export-settings.tsx`
Expected: no errors.

- [ ] **Step 5: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass unchanged (presentational-only changes).

- [ ] **Step 6: Commit**

```bash
git add src/components/settings/appearance-settings.tsx src/components/transactions/transaction-form.tsx src/components/settings/export-settings.tsx
git commit -m "fix(design): add hover/focus states to the theme picker, transaction-type toggle, and export button

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Full verification and deploy

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass, unchanged count.

- [ ] **Step 2: Typecheck, lint, and build the whole project**

Run: `npx tsc --noEmit && npx eslint . && npx next build`
Expected: no errors, successful build.

- [ ] **Step 3: Push to trigger a Vercel deploy**

```bash
git push
```

- [ ] **Step 4: Manually verify on the live deployment**

- Tab through the sidebar (desktop width) with the keyboard: confirm a visible ring appears on the collapse toggle, the Quick Capture trigger, and each nav link in turn.
- Resize to mobile width, tab through the mobile header's hamburger and Quick Capture buttons, then open the drawer and tab through its links — confirm a visible ring at every stop.
- Open Quick Capture, tab to an example command and confirm a visible ring; parse and confirm a command, then tab to Undo/View and confirm a visible ring there too.
- Tab through the Settings theme picker and the Transactions page's Transaction/Transfer toggle — confirm a ring on each, and a hover highlight on the inactive option.
- Confirm the Export button in Settings still submits correctly and looks like every other primary button in the app.
- Confirm no previously-static card (account rows, transaction rows, dashboard stat cards) now looks or behaves as if it's clickable — only real buttons/links show any interactive treatment.

- [ ] **Step 5: Report results to the user**

Summarize: tests passing (count), build clean, live verification outcomes, and that this completes Phase 20.3 — the last phase of the visual-design half of `plan-20`. Note that Phase 20.4 (`Account.purpose` schema + migration + form) and Phase 20.5 (Accounts page regrouping) remain, and ask which to do next.
