# Visual Refresh — Design

**Status:** Approved by user, 2026-09-13

## Goal

Replace the app's current warm cream/deep-green/coral brand and Geist Sans typeface with a new near-black/white palette, Manrope typography, and an accent system where each accent color drives three coordinated tonal shades (nav bar, buttons/progress fill, subtle backgrounds) instead of one flat color applied everywhere.

## Context

Explored interactively via the visual companion (mockups in `.superpowers/brainstorm/`, gitignored). The user picked a direction, then iterated: Manrope for all type (not just headings), an accent-tinted nav bar rather than a fixed color or a flat blend, and a tonal (dark/base/light) system per accent rather than one flat shade reused everywhere.

Current state (`src/app/globals.css`): a warm cream/near-black-brown palette, `--nav-background`/`--nav-foreground` fixed and explicitly documented as never changing with the user's accent, and a `[data-accent="..."]` system that overrides only `--primary`/`--primary-foreground`/`--ring` with one flat shade per accent (coral/blue/green/purple/neutral). Typography is Geist Sans (`src/app/layout.tsx`), unchanged since project start.

## Approach

### Palette

- **Light mode:** background `#fafafa`, foreground `#0a0a0a` (near-white / near-black — replacing `#faf3e8`/`#2b241c`). Card/popover stay white (`#ffffff`) for contrast against the slightly-off-white page background. Secondary/muted/accent/border/input move from warm cream tones to a neutral gray scale.
- **Dark mode:** background `#0a0a0a`, foreground `#fafafa` — a true near-black rather than today's warm dark-brown (`#201c16`).
- **Chart colors:** `--chart-1` (expense, used in both report charts) becomes the Rose base shade; `--chart-2` (income) becomes the Emerald base shade — semantically distinct, and consistent with the new palette instead of today's warm reds/greens. `--chart-3/4/5` (currently unused in code) are updated to Amber/Indigo/Teal bases for whenever they're used.
- **`--sidebar-*` tokens** are unused dead CSS (no shadcn Sidebar component exists in this codebase) — left untouched, out of scope.

### Typography

- `src/app/layout.tsx`: replace the `Geist`/`Geist_Mono` imports from `next/font/google` with `Manrope` (weights 500/700/800 covering body/medium-emphasis/heading use). `--font-mono` can keep `Geist_Mono` (unused visually, harmless) or be dropped — dropped, since nothing in this codebase renders monospace text.
- `src/app/globals.css`: `--font-sans` and `--font-heading` both point at the Manrope variable — one font family everywhere, per the user's explicit choice ("Manrope for everything").

### Accent system: three tonal shades per accent

Today: `[data-accent="X"]` sets only `--primary`/`--primary-foreground`/`--ring`, and `--nav-background`/`--nav-foreground` are fixed in `:root`/`.dark`, documented as never changing with accent. This spec removes that separation. Each accent block now also sets:

- `--nav-background` / `--nav-foreground` — the **dark** shade (nav bar)
- `--primary` / `--primary-foreground` / `--ring` — the **base** shade (buttons, active nav-link state, on-track progress fill) — unchanged role from today
- `--accent-tint` (**new token**) — the **light** shade (progress-bar track backgrounds, other subtle fills)

`--accent-tint` is a genuinely new CSS variable, added to the `@theme inline` block (`--color-accent-tint: var(--accent-tint);`) so it's usable as a Tailwind utility (`bg-accent-tint`) the same way `--primary` already is.

Over-budget progress bars keep using the existing semantic `--destructive` red regardless of accent — unchanged from today's behavior.

### Accent color presets — replacing coral/blue/green/purple/neutral

| Old | New | Dark (nav) | Base (buttons/progress) | Light (tint) |
|---|---|---|---|---|
| coral (default) | **Emerald** (new default) | `#065f46` | `#059669` | `#d1fae5` |
| blue | **Teal** | `#134e4a` | `#0d9488` | `#ccfbf1` |
| green | **Amber** | `#78350f` | `#b45309` | `#fef3c7` |
| purple | **Indigo** | `#312e81` | `#3730a3` | `#e0e7ff` |
| — (new) | **Rose** | `#881337` | `#be123c` | `#ffe4e6` |
| neutral | **Stone** | `#292524` | `#44403c` | `#e7e5e4` |

Every `--primary-foreground` and nav-foreground pairing must be re-verified for WCAG AA (4.5:1) the same way the original four were — see Testing below; the table above lists base/dark hex values, the plan will compute and document exact foreground pairings and any darkening adjustments needed (mirroring the original accent system's approach of darkening any shade that failed AA).

`src/lib/constants/appearance.ts`'s `ACCENT_COLORS` array is updated to this new value/label/swatch list — this is the single source of truth already reused by both onboarding and Settings, so no separate UI-layer change is needed beyond this one file plus the CSS blocks.

### Migration of existing stored accent values

No data migration script — this is a pre-launch app with effectively one real account plus the demo account. A `User.accentColor` row still holding an old value (e.g. `"coral"`) simply won't match any `[data-accent="..."]` selector after this change, so that user silently gets the `:root`/`.dark` default styling (which is set to the new Emerald shades) rather than an error. Revisiting Settings and re-picking an accent fixes it going forward. This is called out explicitly rather than left implicit.

## Components touched

- `src/app/globals.css` — full palette rewrite, `--accent-tint` token added, all six `[data-accent="..."]` blocks rewritten with three shades each, chart colors updated
- `src/app/layout.tsx` — font import swapped to Manrope
- `src/lib/constants/appearance.ts` — `ACCENT_COLORS` list replaced
- `src/lib/validations/settings.ts` / `src/lib/validations/onboarding.ts` — no code change needed (both already derive their enum from `ACCENT_COLOR_VALUES`, which updates automatically from the constants file), but their existing tests hardcode old values like `"coral"` and must be updated
- `src/components/settings/appearance-settings.tsx` — no logic change expected (it already maps over `ACCENT_COLORS`), verify visually after the constants change
- `src/components/nav/top-nav.tsx`, `src/components/nav/bottom-nav.tsx` — no code change expected (both already reference `var(--nav-background)`/`var(--nav-foreground)`, which now vary by accent instead of being fixed) — verify visually
- Budget page's progress bar component (wherever `--muted`/track-background is currently hardcoded for the spent-vs-budget bar) — switch its track background to `--accent-tint`

## Testing

- Existing test files that hardcode old accent values (`src/lib/settings.test.ts`, `src/lib/validations/settings.test.ts`, `src/lib/validations/onboarding.test.ts`, `src/lib/categories.test.ts` if it references accent — verify during implementation) get their fixture strings updated from coral/blue/green/purple/neutral to emerald/teal/amber/indigo/rose/stone.
- No new unit tests — this is a CSS/token/constants change with no new domain logic. Verification is: automated WCAG contrast computation (real sRGB relative-luminance math, the same methodology used for the original accent system) for every accent's `--primary-foreground` and `--nav-foreground` pairing, plus a full manual browser pass — every page, every accent selected in turn, both light and dark mode, desktop and mobile nav.

## Out of scope

- No change to the destructive/error red, or to any other semantic color (success/warning tokens if any exist beyond destructive).
- No change to `--sidebar-*` tokens (unused).
- No per-category color system changes (categories have their own independent color tags, e.g. `category-form-dialog.tsx`'s `color: "coral"` default — unrelated to this UI accent system, left untouched).
- No custom domain, no further deployment changes — this is a pure front-end visual change, verified against the already-deployed production app the same way prior plans were.
