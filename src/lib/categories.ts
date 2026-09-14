import type { PrismaClient } from "@prisma/client";

export type CategoryInput = { name: string; type: string; color: string; icon: string };
export type SubcategoryInput = { name: string; categoryId: string };
export type CategoryMutationResult = { ok: true } | { ok: false; error: string };

export async function createCategory(
  prisma: Pick<PrismaClient, "category">,
  userId: string,
  input: CategoryInput,
) {
  return prisma.category.create({ data: { userId, ...input } });
}

export async function updateCategory(
  prisma: Pick<PrismaClient, "category">,
  userId: string,
  categoryId: string,
  input: Partial<CategoryInput>,
): Promise<CategoryMutationResult> {
  const result = await prisma.category.updateMany({
    where: { id: categoryId, userId },
    data: input,
  });
  if (result.count === 0) {
    return { ok: false, error: "Category not found" };
  }
  return { ok: true };
}

export async function archiveCategory(
  prisma: Pick<PrismaClient, "category">,
  userId: string,
  categoryId: string,
): Promise<CategoryMutationResult> {
  const result = await prisma.category.updateMany({
    where: { id: categoryId, userId },
    data: { archivedAt: new Date() },
  });
  if (result.count === 0) {
    return { ok: false, error: "Category not found" };
  }
  return { ok: true };
}

export async function listCategories(
  prisma: Pick<PrismaClient, "category">,
  userId: string,
  options: { includeArchived?: boolean } = {},
) {
  return prisma.category.findMany({
    where: {
      userId,
      ...(options.includeArchived ? {} : { archivedAt: null }),
    },
    include: { subcategories: { where: { archivedAt: null } } },
    orderBy: { sortOrder: "asc" },
  });
}

export async function assertOwnedCategory(
  prisma: Pick<PrismaClient, "category">,
  userId: string,
  categoryId: string,
): Promise<boolean> {
  const category = await prisma.category.findFirst({ where: { id: categoryId, userId } });
  return category !== null;
}

export async function assertOwnedSubcategory(
  prisma: Pick<PrismaClient, "subcategory">,
  userId: string,
  subcategoryId: string,
): Promise<boolean> {
  const subcategory = await prisma.subcategory.findFirst({ where: { id: subcategoryId, userId } });
  return subcategory !== null;
}

export type CreateSubcategoryResult = { ok: true; id: string } | { ok: false; error: string };

export async function createSubcategory(
  prisma: Pick<PrismaClient, "subcategory" | "category">,
  userId: string,
  input: SubcategoryInput,
): Promise<CreateSubcategoryResult> {
  const category = await prisma.category.findFirst({ where: { id: input.categoryId, userId } });
  if (!category) return { ok: false, error: "Category not found" };

  const subcategory = await prisma.subcategory.create({ data: { userId, ...input } });
  return { ok: true, id: subcategory.id };
}

export async function archiveSubcategory(
  prisma: Pick<PrismaClient, "subcategory">,
  userId: string,
  subcategoryId: string,
): Promise<CategoryMutationResult> {
  const result = await prisma.subcategory.updateMany({
    where: { id: subcategoryId, userId },
    data: { archivedAt: new Date() },
  });
  if (result.count === 0) {
    return { ok: false, error: "Subcategory not found" };
  }
  return { ok: true };
}
