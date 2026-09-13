import { z } from "zod";
import { ACCOUNT_TYPES, ACCOUNT_PURPOSES } from "@/lib/constants/financial";

export const accountSchema = z.object({
  name: z.string().min(1, "Name is required"),
  accountType: z.enum(ACCOUNT_TYPES),
  openingBalance: z.number(), // major units — converted to minor units by the caller
  currency: z.string().min(1),
  purpose: z.enum(ACCOUNT_PURPOSES),
  isPrimaryFundingAccount: z.boolean(),
  color: z.string().min(1),
  icon: z.string().min(1),
});
