import { z } from "zod";
import { ACCOUNT_TYPES } from "@/lib/constants/financial";

export const onboardingSchema = z.object({
  cycleStartDay: z.number().int().min(1).max(31),
  currency: z.string().min(1),
});

export const firstAccountSchema = z.object({
  name: z.string().min(1, "Name is required"),
  accountType: z.enum(ACCOUNT_TYPES),
  openingBalance: z.number(),
});
