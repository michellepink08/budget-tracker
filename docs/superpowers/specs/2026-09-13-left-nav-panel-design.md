# Left Nav Panel — Design

**Status:** Approved by user, 2026-09-13

## Goal

Replace the desktop top nav bar with a fixed left-side vertical panel. Mobile is explicitly unchanged — it keeps Plan 8's bottom tab bar exactly as built.

## Approach

- **Desktop (`md` and above):** a new `SideNav` component — logo/app name at top, the same 8 links stacked vertically (active link = highlighted background block, not the current underline), Add button + Sign out pinned at the bottom. Rendered as a normal-flow flex sibling (not `position: fixed` + manual margin math) so the layout math stays simple: the page root becomes a horizontal flex container with `SideNav` and a vertical flex column (header/main/bottom-nav) side by side.
- **Mobile (below `md`):** `TopNav` shrinks to just the slim mobile header it already partly was — logo, Add button, Sign out — with its link row removed entirely (that row moves into `SideNav`, desktop-only). `BottomNav` is untouched.
- **Layout:** `src/app/(app)/layout.tsx`'s root becomes `<div className="flex min-h-screen ..."><SideNav .../><div className="flex flex-1 flex-col"><TopNav/><main className="flex-1 ...">...</main><BottomNav/></div></div>`.

## Components touched

- `src/components/nav/top-nav.tsx` — strip down to logo + Add + Sign out only, hidden entirely at `md` and above (`md:hidden` on the whole `<header>`, not just the link row); drop the now-unused `usePathname`/`links` code
- `src/components/nav/side-nav.tsx` (new) — the desktop panel, reusing the same `links` array, `AddTransactionButton`, and `SignOutButton` `TopNav` already used
- `src/app/(app)/layout.tsx` — restructure to the flex arrangement above

`BottomNav` is untouched — no file changes there.

## Testing

No new tests — presentational/routing UI only, consistent with `TopNav`/`BottomNav` having no test files today. Verification is manual: desktop shows the left panel with correct active-state highlighting, all 8 links navigate correctly, Add/Sign out work from the panel; mobile is pixel-for-pixel unchanged from Plan 8 (slim top header + bottom tab bar, no left panel).

## Out of scope

- Any mobile nav change — explicitly decided against (slide-out drawer considered and declined; bottom tab bar stays).
- Collapsible/resizable sidebar, keyboard shortcuts, or any interaction beyond plain navigation — not requested.
