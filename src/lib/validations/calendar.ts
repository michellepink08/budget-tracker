import { z } from "zod";

export const reminderSchema = z.object({
  label: z.string().min(1, "Label is required"),
  date: z.coerce.date(),
  amount: z.number().nullable(), // major units; converted by the caller
});

export const markReminderPaidSchema = z.object({
  accountId: z.string().min(1, "Account is required"),
  categoryId: z.string().nullable(),
});
