import { z } from "zod";

export const installmentPurchaseSchema = z.object({
  name: z.string().min(1, "Name is required"),
  totalAmount: z.number().positive("Total amount must be greater than zero"), // major units
  numberOfTerms: z.number().int().min(2, "At least 2 terms").max(60, "At most 60 terms"),
  accountId: z.string().min(1),
  categoryId: z.string().optional(),
  startDate: z.date(),
});
