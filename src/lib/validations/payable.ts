import { z } from "zod";

export const payableSchema = z.object({
  name: z.string().min(1, "Name is required"),
  amount: z.number().positive("Amount must be greater than zero"), // major units
  dueDate: z.date(),
  accountId: z.string().min(1),
  categoryId: z.string().optional(),
});
