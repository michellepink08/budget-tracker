import { z } from "zod";

// TRANSFER isn't here — it's created via transferSchema/createTransfer
// (Plan 2A), not the regular transaction form.
export const NON_TRANSFER_TYPES = [
  "EXPENSE",
  "INCOME",
  "REFUND",
  "SAVINGS",
  "LOAN_PAYMENT",
  "CREDIT_CARD_PAYMENT",
  "TRANSFER_FEE",
] as const;

export const transactionSchema = z.object({
  type: z.enum(NON_TRANSFER_TYPES),
  amount: z.number().positive("Amount must be greater than zero"), // major units
  date: z.date(),
  accountId: z.string().min(1),
  categoryId: z.string().optional(),
  subcategoryId: z.string().optional(),
  description: z.string().optional(),
  notes: z.string().optional(),
});

export const transferSchema = z
  .object({
    amount: z.number().positive("Amount must be greater than zero"), // major units
    date: z.date(),
    sourceAccountId: z.string().min(1),
    destinationAccountId: z.string().min(1),
    description: z.string().min(1, "Description is required"),
  })
  .refine((data) => data.sourceAccountId !== data.destinationAccountId, {
    message: "Source and destination accounts must be different",
    path: ["destinationAccountId"],
  });
