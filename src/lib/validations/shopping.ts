import { z } from "zod";
import { PRICE_SOURCES, SHOPPING_ITEM_PRIORITIES } from "@/lib/constants/financial";

export const catalogItemSchema = z.object({
  canonicalName: z.string().min(1, "Name is required"),
  brand: z.string().nullable(),
  size: z.string().nullable(),
  unit: z.string().nullable(),
  categoryId: z.string().nullable(),
  defaultQuantity: z.number().positive(),
  preferredStoreId: z.string().nullable(),
  // Comma-separated in the form, split into an array here.
  aliases: z
    .string()
    .nullable()
    .transform((value) => (value ? value.split(",").map((a) => a.trim()).filter(Boolean) : [])),
});

export const priceRecordSchema = z.object({
  storeId: z.string().nullable(),
  unitPrice: z.number().nonnegative(), // major units; converted by the caller
  source: z.enum(PRICE_SOURCES),
});

export const shoppingListSchema = z.object({
  name: z.string().min(1, "Name is required"),
  plannedDate: z.coerce.date().nullable(),
  budgetCategoryId: z.string().nullable(),
});

export const shoppingListItemSchema = z.object({
  catalogItemId: z.string().nullable(),
  freeTextName: z.string().nullable(),
  quantity: z.number().positive(),
  unit: z.string().nullable(),
  estimatedUnitPrice: z.number().nullable(), // major units; converted by the caller
  preferredStoreId: z.string().nullable(),
  categoryId: z.string().nullable(),
  priority: z.enum(SHOPPING_ITEM_PRIORITIES),
  notes: z.string().nullable(),
});
