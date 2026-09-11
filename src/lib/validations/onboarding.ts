import { z } from "zod";

export const onboardingSchema = z.object({
  cycleStartDay: z.coerce.number().int().min(1).max(31),
  currency: z.string().min(1),
  accentColor: z.string().min(1),
});
