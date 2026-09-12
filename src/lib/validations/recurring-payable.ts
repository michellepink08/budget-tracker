import { z } from "zod";
import { RECURRING_FREQUENCIES } from "@/lib/constants/financial";

export const recurringPayableSchema = z
  .object({
    name: z.string().min(1, "Name is required"),
    amount: z.number().positive("Amount must be greater than zero"), // major units
    frequency: z.enum(RECURRING_FREQUENCIES),
    intervalDays: z.number().int().positive().optional(),
    nextDueDate: z.date(),
    accountId: z.string().min(1),
    categoryId: z.string().optional(),
  })
  .refine((data) => data.frequency !== "CUSTOM" || data.intervalDays !== undefined, {
    message: "Custom frequency requires an interval (in days)",
    path: ["intervalDays"],
  });
