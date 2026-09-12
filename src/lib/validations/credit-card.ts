import { z } from "zod";

export const creditCardSchema = z.object({
  accountId: z.string().min(1),
  creditLimit: z.number().positive("Credit limit must be greater than zero"), // major units
  statementDay: z.number().int().min(1).max(31),
  paymentDueDay: z.number().int().min(1).max(31),
  interestRate: z.number().min(0, "Interest rate can't be negative"),
});
