import { z } from "zod";

export const savingsGoalSchema = z.object({
  targetAmount: z.number().nullable(), // major units, null = no target set; converted by the caller
  assignedAmount: z.number(), // major units
});
