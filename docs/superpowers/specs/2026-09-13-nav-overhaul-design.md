# Navigation Overhaul (Phase 6) — Design

**Status:** Approved by user, 2026-09-13

## Goal

Replace `BottomNav` (mobile bottom tab bar + "More" menu) with a left-side off-canvas drawer on mobile/tablet, and give the desktop `SideNav` a collapsible icon-only mode with tooltips, active-state, and a remembered preference — per the user's detailed navigation requirements from the original Quick Capture request. This directly supersedes Plan 8 (mobile bottom nav), which built exactly what the user has now said they don't want.

## Approach

### Reuse over rebuild: the drawer is a repositioned `Dialog`

Base UI's existing `Dialog` primitive already provides, for free: closes on outside (backdrop) click, closes on Escape, focus trapping while open, and background scroll lock. Every one of those is an explicit requirement for the mobile drawer. Rather than building a bespoke off-canvas panel from scratch, `NavDrawer` reuses `Dialog`/`DialogContent` with an overridden `className` that repositions the popup to a full-height left-anchored panel (`inset-y-0 left-0 h-full w-72 max-w-[85vw] rounded-none`, sliding in/out via the existing `tw-animate-css` utilities already used elsewhere in this file) instead of the default centered modal. `DialogContent`'s built-in `showCloseButton` already satisfies "include a visible close button."

### No new Tooltip primitive

This codebase has no Tooltip component. The desktop sidebar's collapsed-state tooltips use the browser's native `title` attribute — a real, if visually plain, tooltip. The user explicitly said to proceed with this and adjust later if they don't like it.

### Desktop: `SideNav` gains a collapse toggle

- A small icon button (e.g. a chevron) at the top of the sidebar toggles between expanded (current `w-56`, labels visible) and collapsed (`w-16`, icons only, `title` attribute per link).
- Active-page indicator stays visible in both states (background highlight in expanded mode; the same highlight around just the icon in collapsed mode).
- The collapsed/expanded preference is stored in `localStorage` (`sidebarCollapsed`, a boolean) — a per-device viewing preference, not account data, so it doesn't need a database column or to sync across devices.
- Nothing becomes unreachable when collapsed — every link, Quick Capture, and Sign out all remain present, just icon-only.

### Mobile/tablet: `NavDrawer` replaces `BottomNav` entirely

- `BottomNav` is deleted, not hidden.
- A new slim mobile header (replacing `TopNav`'s current content) shows: a hamburger button (opens the drawer), the current page's title (derived from the existing `links` array via `pathname`), and the existing Quick Capture button.
- The drawer itself lists every nav item in one plain vertical list (no "More" menu), plus Quick Capture and Sign out — reusing the same `links` array `SideNav` already has, so both surfaces can never drift apart from having their own separate hardcoded lists.
- Selecting a nav item closes the drawer (an `onClick` that also calls the close handler, same pattern `BottomNav`'s old "More" menu already used for its links).
- Screen-reader labeling: the hamburger button gets `aria-label="Open navigation"`, the drawer's close button already has `sr-only` "Close" text from the existing `DialogContent`, and the drawer's root can carry `aria-label="Main navigation"` for the dialog's accessible name.

## Components touched

- `src/components/nav/side-nav.tsx` — add collapse state, toggle button, `localStorage` persistence, `title`-attribute tooltips in collapsed mode
- `src/components/nav/nav-drawer.tsx` (new) — the mobile/tablet drawer
- `src/components/nav/top-nav.tsx` — becomes the slim mobile header (hamburger + title + Quick Capture), replacing its current logo+Add+SignOut content
- `src/components/nav/bottom-nav.tsx` — deleted
- `src/app/(app)/layout.tsx` — remove `BottomNav`, wire `NavDrawer`, remove the now-unnecessary `pb-20` bottom padding on `<main>` (nothing fixed to the bottom of the viewport on mobile anymore)

## Testing

No new unit tests — this is presentational/routing UI with no domain logic, consistent with every nav component in this codebase having no test file today. Verification is manual: desktop collapse/expand (including a page reload to confirm the preference persists), tooltips visible when collapsed, mobile drawer opens/closes via hamburger/backdrop/Escape/link-click, background scroll locked while open, and no leftover bottom-bar behavior anywhere.

## Out of scope

- A real custom Tooltip component (native `title` for now, per the user's explicit "go ahead, I'll change it if I don't like it").
- Tablet-specific breakpoint tuning beyond "same as mobile" — the user's requirements group mobile and tablet together for the drawer behavior, so this doesn't introduce a third distinct layout.
- Voice input, still Phase 7.
