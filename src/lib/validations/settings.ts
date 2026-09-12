import { z } from "zod";
import { ACCENT_COLOR_VALUES, THEME_MODES } from "@/lib/constants/appearance";

export const accentColorSchema = z.object({
  accentColor: z.enum(ACCENT_COLOR_VALUES),
});

export const themeModeSchema = z.object({
  themeMode: z.enum(THEME_MODES),
});
