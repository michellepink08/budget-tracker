import { z } from "zod";

export const loanSchema = z
  .object({
    name: z.string().min(1, "Name is required"),
    principal: z.number().positive("Principal must be greater than zero"), // major units
    interestRate: z.number().min(0, "Interest rate can't be negative"),
    monthlyPayment: z.number().positive("Monthly payment must be greater than zero"), // major units
    remainingBalance: z.number().min(0, "Remaining balance can't be negative"), // major units
    startDate: z.date(),
    endDate: z.date().optional(),
    dueDay: z.number().int().min(1).max(31).optional(),
  })
  .refine((data) => !data.endDate || data.endDate > data.startDate, {
    message: "End date must be after the start date",
    path: ["endDate"],
  });
