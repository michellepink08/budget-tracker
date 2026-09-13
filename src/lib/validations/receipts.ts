import { z } from "zod";

export const draftReceiptSchema = z.object({
  storeName: z.string().nullable(),
  purchaseDate: z.coerce.date().nullable(),
  receiptNumber: z.string().nullable(),
});

export const receiptLineSchema = z.object({
  catalogItemId: z.string().nullable(),
  name: z.string().min(1, "Name is required"),
  quantity: z.number().positive(),
  unitPrice: z.number().nullable(), // major units; converted by the caller
  lineTotal: z.number(), // major units; converted by the caller
  categoryId: z.string().nullable(),
  excluded: z.boolean(),
});

export const receiptTotalsSchema = z.object({
  subtotal: z.number().nullable(),
  discount: z.number(),
  tax: z.number(),
  fees: z.number(),
  grandTotal: z.number().nullable(),
  unitemizedDifference: z.number(),
});

export const confirmReceiptSchema = z.object({
  accountId: z.string().min(1, "Account is required"),
  categoryId: z.string().nullable(),
  date: z.coerce.date(),
});
