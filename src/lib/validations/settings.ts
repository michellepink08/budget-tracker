import { z } from "zod";
import { THEME_MODES } from "@/lib/constants/appearance";

export const themeModeSchema = z.object({
  themeMode: z.enum(THEME_MODES),
});
