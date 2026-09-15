import { z } from "zod";

export const lendingSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("CASH"),
    borrowerName: z.string().min(1, "Borrower name is required"),
    amount: z.number().positive("Amount must be greater than zero"), // major units
    accountId: z.string().min(1, "Account is required"),
    date: z.date(),
  }),
  z.object({
    kind: z.literal("ITEM"),
    borrowerName: z.string().min(1, "Borrower name is required"),
    itemDescription: z.string().min(1, "Item description is required"),
    itemValue: z.number().min(0).optional(), // major units
    date: z.date(),
  }),
]);
