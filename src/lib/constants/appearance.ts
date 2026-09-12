// Single source of truth for the accent-color preset list (first offered
// at onboarding, reused by Settings) and the theme-mode value set. Each
// value here must have a matching [data-accent="..."] block in
// globals.css defining its three tonal shades (nav/primary/tint), all
// verified against WCAG AA (4.5:1) before adding a new one.
export const ACCENT_COLORS = [
  { value: "emerald", label: "Emerald", swatch: "#059669" },
  { value: "teal", label: "Teal", swatch: "#0d9488" },
  { value: "amber", label: "Amber", swatch: "#b45309" },
  { value: "indigo", label: "Indigo", swatch: "#3730a3" },
  { value: "rose", label: "Rose", swatch: "#be123c" },
  { value: "stone", label: "Stone", swatch: "#44403c" },
  { value: "wine", label: "Wine", swatch: "#7c1d3f" },
] as const;
export type AccentColor = (typeof ACCENT_COLORS)[number]["value"];
export const ACCENT_COLOR_VALUES = ACCENT_COLORS.map((c) => c.value) as [AccentColor, ...AccentColor[]];

export const THEME_MODES = ["light", "dark", "system"] as const;
export type ThemeMode = (typeof THEME_MODES)[number];
