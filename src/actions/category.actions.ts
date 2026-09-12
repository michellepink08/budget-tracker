"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { categorySchema, subcategorySchema } from "@/lib/validations/category";
import {
  archiveCategory,
  archiveSubcategory,
  createCategory,
  createSubcategory,
  updateCategory,
} from "@/lib/categories";

export type CategoryActionResult = { ok: true } | { ok: false; error: string };

export async function createCategoryAction(formData: FormData): Promise<CategoryActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const parsed = categorySchema.safeParse({
    name: formData.get("name"),
    type: formData.get("type"),
    color: formData.get("color"),
    icon: formData.get("icon"),
  });
  if (!parsed.success) return { ok: false, error: "Please check the category details" };

  await createCategory(prisma, session.user.id, parsed.data);
  revalidatePath("/settings");
  return { ok: true };
}

export async function updateCategoryAction(
  categoryId: string,
  formData: FormData,
): Promise<CategoryActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const parsed = categorySchema.safeParse({
    name: formData.get("name"),
    type: formData.get("type"),
    color: formData.get("color"),
    icon: formData.get("icon"),
  });
  if (!parsed.success) return { ok: false, error: "Please check the category details" };

  const result = await updateCategory(prisma, session.user.id, categoryId, parsed.data);
  if (result.ok) revalidatePath("/settings");
  return result;
}

export async function archiveCategoryAction(categoryId: string): Promise<CategoryActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const result = await archiveCategory(prisma, session.user.id, categoryId);
  if (result.ok) revalidatePath("/settings");
  return result;
}

export async function createSubcategoryAction(formData: FormData): Promise<CategoryActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const parsed = subcategorySchema.safeParse({
    name: formData.get("name"),
    categoryId: formData.get("categoryId"),
  });
  if (!parsed.success) return { ok: false, error: "Please check the subcategory details" };

  await createSubcategory(prisma, session.user.id, parsed.data);
  revalidatePath("/settings");
  return { ok: true };
}

export async function archiveSubcategoryAction(
  subcategoryId: string,
): Promise<CategoryActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const result = await archiveSubcategory(prisma, session.user.id, subcategoryId);
  if (result.ok) revalidatePath("/settings");
  return result;
}
