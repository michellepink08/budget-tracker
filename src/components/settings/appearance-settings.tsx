"use client";

import { useState } from "react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { updateAccentColorAction, updateThemeModeAction } from "@/actions/settings.actions";
import { ACCENT_COLORS, THEME_MODES } from "@/lib/constants/appearance";
import { Label } from "@/components/ui/label";

export function AppearanceSettings({
  initialAccentColor,
  initialThemeMode,
}: {
  initialAccentColor: string;
  initialThemeMode: string;
}) {
  const { setTheme } = useTheme();
  const [accentColor, setAccentColor] = useState(initialAccentColor);
  const [themeMode, setThemeMode] = useState(initialThemeMode);

  async function handleAccentChange(value: string) {
    setAccentColor(value);
    const result = await updateAccentColorAction(value);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Accent color updated");
  }

  async function handleThemeChange(value: string) {
    setThemeMode(value);
    setTheme(value); // instant client-side switch, next-themes' own mechanism
    const result = await updateThemeModeAction(value);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Theme updated");
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Label>Accent color</Label>
        <div className="flex gap-2">
          {ACCENT_COLORS.map((color) => (
            <button
              key={color.value}
              type="button"
              aria-label={color.label}
              onClick={() => handleAccentChange(color.value)}
              className="h-8 w-8 rounded-full border-2"
              style={{
                backgroundColor: color.swatch,
                borderColor: accentColor === color.value ? color.swatch : "transparent",
                outline: accentColor === color.value ? "2px solid currentColor" : "none",
                outlineOffset: 2,
              }}
            />
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Theme</Label>
        <div className="flex gap-2">
          {THEME_MODES.map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => handleThemeChange(mode)}
              className={
                themeMode === mode
                  ? "rounded-md border-2 border-primary px-3 py-1.5 text-sm capitalize"
                  : "rounded-md border-2 border-transparent px-3 py-1.5 text-sm capitalize text-muted-foreground"
              }
            >
              {mode}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
