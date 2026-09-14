# Wine Theme v3 — Surfaces, Cards, and Left Navigation — Design

**Goal:** A visual-only pass — elevate surface hierarchy, add a polished card hover/focus system, and rebuild the left navigation's look (gradient, sections, active state, Quick Capture, branding) — with zero changes to routes, calculations, database behavior, or existing component functionality.

**Context:** Every color value in the user's spec already exists in `globals.css`, exact to the hex digit (Stage C's "Design tokens v2" work) — there are no new tokens to add. The gap is in card interactivity (a hover/focus system that falls short of spec), the left nav's visual treatment (gradient, active state, Quick Capture, sections, branding), mobile's matching structure, and one small new UI element (a profile menu). Confirmed with the user: Audit History (a 12th route not mentioned in their 11-item nav structure) goes under "PLAN & REVIEW" after Reports; the mobile profile-menu is a real new dropdown, not a restyle of the existing always-visible sign-out button.

---

## 1. Card hover/focus system

`src/components/ui/card.tsx`'s `interactive` variant gets extended in place (same variant-prop API, no consumer changes needed):

- Lift `2-3px` (`hover:-translate-y-0.5` → adjust to a slightly larger custom value), not today's `-translate-y-px`
- Scale `1.01` (`hover:scale-[1.01]`)
- Strengthen shadow (already does; keep, tune)
- **Border glow keyed to the card's own semantic variant** — this is the one part needing per-variant logic, since "glow color" must match whichever `variant` (disposable/savings/restricted/expense/completed/etc.) the card already has. Handled via each variant's own hover addition (e.g. `savings: "... hover:border-savings-accent/60 hover:shadow-[0_0_0_1px_var(--savings-accent)/20]"`) rather than a separate prop.
- Background brighten a touch on hover (`hover:brightness-105` — respects both themes since it's a filter, not a hard-coded color)
- Icon lift: any `IconBadge` inside an interactive card gets a small `group-hover:-translate-y-0.5` — requires `Card` to render as a `group` when `interactive`, and `IconBadge` to opt into the group-hover translate (additive, doesn't change its default look outside a card)
- Transition duration `200ms` (within the 180-220ms range), applied to transform/shadow/filter together
- Focus-visible gets the identical treatment to hover (already partly true; extend to cover scale/glow/brighten too)
- Touch: a `active:` pressed state (slightly reduced scale/lift) for the touch-equivalent of hover
- `motion-reduce:` strips translate/scale but keeps the border-glow/shadow/brighten and the focus ring — matches the existing pattern already used elsewhere in the codebase (nav links, badges)
- Non-interactive cards (`interactive: false`, the default) get zero cursor/lift/scale change — the spec's "gentle illumination only" for summary cards is already what `default`/`raised`/semantic variants provide via their own static shadow; no new work needed there beyond confirming no page marks a purely-informational card `interactive`

## 2. App-wide surface/card audit

A systematic re-check (not assumed from Stage K's partial spot-check) that every page's cards/boxes use the semantic surface pairs consistently and that adjacent boxes with different meanings are visually distinct — walking all 12 page areas already enumerated in Stage K's report, this time checking *which* `Card`/`IconBadge` variant each colored box uses, not just whether any semantic class appears on the page at all.

## 3. Left navigation

**`nav-links.ts`** restructures from one flat `navLinks` array into `mainLinks` (Dashboard, Transactions, Budget, Bills, Accounts, Shopping) and `planLinks` (Calendar, Year Plan, Loans & Cards, Reports, Settings, **Audit History** — appended per the user's confirmed placement), keeping `isNavLinkActive` as-is and adding a small helper both `SideNav` and `NavDrawer` use to render two grouped `<nav>` blocks with a `PLAN & REVIEW` label between them instead of one flat list. No route changes — this only changes which array an existing `<Link>` map iterates over.

**Sidebar background:** replace the 2-stop `bg-gradient-to-b from-[var(--nav-gradient-from)] to-[var(--nav-gradient-to)]` with a literal 3-stop 160deg gradient (`#741E45 0%, #52112F 50%, #2D0D20 100%` — new values, not derived from existing `--nav-gradient-*` tokens, since the spec gives an exact new gradient distinct from the current one) plus a radial rose glow pseudo-element in the upper-left and a soft diagonal highlight overlay — both purely decorative absolutely-positioned layers behind the nav content, `pointer-events-none` so they never intercept clicks.

**Active nav item:** replace `bg-white/15` with the specified `linear-gradient(135deg, #FFF7FA, #F3C9D9)` background and deep-wine (`#4D102D` light / equivalent dark) text/icon color — needs its own dark-mode-safe pair, since a literal cream-to-blush gradient would look wrong against the dark-mode sidebar; light and dark each get their own explicit active gradient/text-color pair (mirroring how `--nav-gradient-from/to` already differ by theme).

**Quick Capture:** restyle from a plain bordered button into a translucent panel (blush-tinted border, inner highlight, slightly stronger hover than regular nav items) and — when collapsed — swap its literal "⌘K" text for an actual icon (a `Search`-family Lucide icon, keeping ⌘K as the accessible pop-out label, reusing the exact tooltip pattern nav links already use rather than inventing a second mechanism).

**Branding tile:** wrap the existing `Wallet` icon in a small rounded blush/cream tile with an inner highlight and soft shadow, collapsing cleanly to just the tile when the sidebar is collapsed (it already does — this only adds the tile styling around the icon that's already there).

**Widths:** `w-56`/`w-16` (224px/64px) adjust to `w-[216px]`/`w-[70px]` to land inside the spec's 210-220px / ~70px ranges.

## 4. Mobile

**`NavDrawer`** gets the same `mainLinks`/`planLinks` grouping and active-item treatment as desktop (still one scrollable list, still no bottom bar or "more" menu — only the visual grouping changes, not the drawer mechanism).

**`TopNav`** gains a new profile menu: a small avatar-style button (the user's email initial, since `session.user` only carries `{id, email}`, no display name) that opens a `@base-ui/react/menu`-based dropdown containing Sign Out — replacing today's always-visible icon button. New file `src/components/ui/dropdown-menu.tsx` wraps the primitive the same way `dialog.tsx` wraps its own base-ui primitive: token-driven (`bg-popover`/`text-popover-foreground`/`border`), so it's dark-mode-safe by construction like every other overlay in the app.

## 5. Inputs and dropdowns

`select.tsx`/`dialog.tsx` already confirmed token-driven with correct dark-mode variants (Stage K). The new `dropdown-menu.tsx` gets built to the same standard from the start. No other input/dropdown changes are needed — this section is verification, not new work, beyond the one new component.

## Non-goals
No route changes, no calculation/database changes, no renamed/removed nav destinations, no bottom-nav or "more" menu on mobile, no changes to Quick Capture's actual behavior (only its collapsed-state visual), no new tests (nothing functional changes) — verified instead by the existing Vitest/Playwright/tsc/eslint/build suite passing unchanged, plus manual visual inspection at mobile/tablet/desktop widths in both themes before calling this done.
