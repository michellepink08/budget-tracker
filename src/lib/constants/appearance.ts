// Single source of truth for the accent-color preset list (first offered
// at onboarding, reused by Settings) and the theme-mode value set. Every
// preset here must meet contrast requirements against the cream/green
// base chrome (design spec's "Visual identity" section) before adding a
// new one.
export const ACCENT_COLORS = [
  { value: "coral", label: "Coral", swatch: "#ff6b5e" },
  { value: "blue", label: "Blue", swatch: "#3b82f6" },
  { value: "green", label: "Green", swatch: "#16a34a" },
  { value: "purple", label: "Purple", swatch: "#8b5cf6" },
  { value: "neutral", label: "Neutral", swatch: "#71717a" },
] as const;
export type AccentColor = (typeof ACCENT_COLORS)[number]["value"];
export const ACCENT_COLOR_VALUES = ACCENT_COLORS.map((c) => c.value) as [AccentColor, ...AccentColor[]];

export const THEME_MODES = ["light", "dark", "system"] as const;
export type ThemeMode = (typeof THEME_MODES)[number];
