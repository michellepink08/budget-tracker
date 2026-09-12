import { z } from "zod";
import { NON_TRANSFER_TYPES } from "@/lib/validations/transaction";
import { RECURRING_FREQUENCIES } from "@/lib/constants/financial";

export const recurringRuleSchema = z
  .object({
    name: z.string().min(1, "Name is required"),
    transactionType: z.enum(NON_TRANSFER_TYPES),
    amount: z.number().positive("Amount must be greater than zero"), // major units
    frequency: z.enum(RECURRING_FREQUENCIES),
    intervalDays: z.number().int().positive().optional(),
    nextDate: z.date(),
    accountId: z.string().min(1),
    categoryId: z.string().optional(),
    subcategoryId: z.string().optional(),
  })
  .refine((data) => data.frequency !== "CUSTOM" || data.intervalDays !== undefined, {
    message: "Custom frequency requires an interval (in days)",
    path: ["intervalDays"],
  });
