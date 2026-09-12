# Personal-Use Simplification — Design

**Status:** Approved by user, 2026-09-13

## Goal

Simplify the app's UI toward the user's own personal use: hide the accent-color and currency pickers, replacing them with fixed personal choices (a new custom "Wine" accent, PHP currency), without deleting the underlying multi-user/customization capability — it stays intact in the codebase for possibly re-enabling later.

## Approach

**Wine accent** — a new preset, added alongside (not replacing) the existing six from the visual refresh:
- Nav (dark): `#4a0f26`
- Base/button/ring (mid): `#7c1d3f`, white foreground (9.98:1, passes AA easily)
- Tint (light, track background): `#eed4dc` light mode / `#2e0f18` dark mode

This becomes the new fixed default (replacing Emerald as the fallback) in every place a default is currently hardcoded.

**Hidden, not deleted:**
- The Accent color picker disappears from both onboarding and Settings — no swatches shown. `ACCENT_COLORS`, every `[data-accent="..."]` CSS block, and `updateAccentColorAction` all stay fully intact and functional; only the UI that invokes them is removed. Re-enabling later is exactly two small UI additions, not a rebuild.
- The Currency picker disappears from onboarding (it was never present in Settings — currency is only ever set once, at onboarding, today). It's hardcoded to `"PHP"` in the submitted form data instead of asked.
- Onboarding narrows to just one question: cycle start day.
- Sign up stays visible, unchanged (explicitly requested).

## Components touched

- `src/app/globals.css` — add the `[data-accent="wine"]` block (light + dark tint variants)
- `src/lib/constants/appearance.ts` — add `wine` to `ACCENT_COLORS` (infrastructure only; not required for the UI change itself, but keeps the single-source-of-truth list complete for whenever the picker returns)
- `src/app/layout.tsx` — default fallback `"emerald"` → `"wine"`
- `prisma/schema.prisma` — `accentColor` default `"emerald"` → `"wine"`
- `src/app/onboarding/page.tsx` — remove the Currency `<select>` and Accent color swatch UI; keep only the Cycle start day field; submit hardcoded `currency: "PHP"`, `accentColor: "wine"` alongside the user's entered cycle day
- `src/components/settings/appearance-settings.tsx` — remove the Accent color block (state, handler, `ACCENT_COLORS` import, JSX) entirely; keep the Theme block untouched
- `src/app/(app)/settings/page.tsx` — stop passing the now-unused `initialAccentColor` prop

No backend validation, schema, server action, or CSS token is deleted — every removal here is UI-layer only, which is what makes this reversible later.

## Testing

No new tests — this is UI removal + one new CSS accent preset (config-only), no new domain logic. Existing tests that reference accent defaults (`onboarding.test.ts`, `validations/onboarding.test.ts`) get their `"emerald"` fixtures updated to `"wine"` to match the new default. Verification is manual: sign up a fresh account, confirm onboarding only asks for cycle start day, confirm the app renders in Wine/PHP without further prompting, confirm Settings no longer shows an accent picker but Theme still works, confirm the demo account (already onboarded) is unaffected until it's reset.

## Out of scope

- The left-side nav panel the user mentioned — explicitly deferred to its own separate plan.
- Deleting any of the six existing accent presets, the accent CSS system, or the currency field itself — none of this is being removed, only its UI surface.
