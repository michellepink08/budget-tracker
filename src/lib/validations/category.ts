import { z } from "zod";
import { CATEGORY_TYPES } from "@/lib/constants/financial";

export const categorySchema = z.object({
  name: z.string().min(1, "Name is required"),
  type: z.enum(CATEGORY_TYPES),
  color: z.string().min(1),
  icon: z.string().min(1),
});

export const subcategorySchema = z.object({
  name: z.string().min(1, "Name is required"),
  categoryId: z.string().min(1),
});
