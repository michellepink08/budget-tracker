"use client";

import { useState } from "react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { updateThemeModeAction } from "@/actions/settings.actions";
import { THEME_MODES } from "@/lib/constants/appearance";
import { Label } from "@/components/ui/label";

export function AppearanceSettings({ initialThemeMode }: { initialThemeMode: string }) {
  const { setTheme } = useTheme();
  const [themeMode, setThemeMode] = useState(initialThemeMode);

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
        <Label>Theme</Label>
        <div className="flex gap-2">
          {THEME_MODES.map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => handleThemeChange(mode)}
              className={
                themeMode === mode
                  ? "rounded-md border-2 border-primary px-3 py-1.5 text-sm capitalize focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  : "rounded-md border-2 border-transparent px-3 py-1.5 text-sm capitalize text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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
