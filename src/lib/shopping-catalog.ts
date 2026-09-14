import type { PrismaClient } from "@prisma/client";

export type ShoppingMutationResult = { ok: true; id: string } | { ok: false; error: string };

type CatalogPrisma = Pick<PrismaClient, "shoppingCatalogItem" | "alias" | "category">;

export type CreateCatalogItemResult = { ok: true; id: string } | { ok: false; error: string };

export async function createCatalogItem(
  prisma: CatalogPrisma,
  userId: string,
  input: {
    canonicalName: string;
    brand: string | null;
    size: string | null;
    unit: string | null;
    categoryId: string | null;
    defaultQuantity: number;
    preferredStoreId: string | null;
    aliases: string[];
  },
): Promise<CreateCatalogItemResult> {
  if (input.categoryId) {
    const category = await prisma.category.findFirst({ where: { id: input.categoryId, userId } });
    if (!category) return { ok: false, error: "Category not found" };
  }

  const { aliases, ...itemInput } = input;
  const item = await prisma.shoppingCatalogItem.create({ data: { userId, ...itemInput } });
  for (const alias of aliases) {
    const normalized = alias.trim().toLowerCase();
    if (!normalized) continue;
    await prisma.alias.create({
      data: { userId, kind: "shopping_item", alias: normalized, targetId: item.id },
    });
  }
  return { ok: true, id: item.id };
}

export async function assertOwnedCatalogItem(
  prisma: Pick<PrismaClient, "shoppingCatalogItem">,
  userId: string,
  catalogItemId: string,
): Promise<boolean> {
  const item = await prisma.shoppingCatalogItem.findFirst({ where: { id: catalogItemId, userId } });
  return item !== null;
}

export async function updateCatalogItem(
  prisma: Pick<PrismaClient, "shoppingCatalogItem" | "category">,
  userId: string,
  catalogItemId: string,
  input: Partial<{
    canonicalName: string;
    brand: string | null;
    size: string | null;
    unit: string | null;
    categoryId: string | null;
    defaultQuantity: number;
    preferredStoreId: string | null;
    isFavorite: boolean;
  }>,
): Promise<ShoppingMutationResult> {
  if (!(await assertOwnedCatalogItem(prisma, userId, catalogItemId))) {
    return { ok: false, error: "Catalog item not found" };
  }
  if (input.categoryId) {
    const category = await prisma.category.findFirst({ where: { id: input.categoryId, userId } });
    if (!category) return { ok: false, error: "Category not found" };
  }
  const item = await prisma.shoppingCatalogItem.update({ where: { id: catalogItemId }, data: input });
  return { ok: true, id: item.id };
}

// Archive, not hard-delete — matches the app's Account/Category convention
// (archivedAt) rather than the Year Plan's hard-delete convention, since a
// catalog item is referenced by historical price rows and past list items
// that should keep displaying correctly.
export async function archiveCatalogItem(
  prisma: Pick<PrismaClient, "shoppingCatalogItem">,
  userId: string,
  catalogItemId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await assertOwnedCatalogItem(prisma, userId, catalogItemId))) {
    return { ok: false, error: "Catalog item not found" };
  }
  await prisma.shoppingCatalogItem.update({ where: { id: catalogItemId }, data: { archivedAt: new Date() } });
  return { ok: true };
}

export type RecordPriceResult = { ok: true; id: string } | { ok: false; error: string };

export async function recordPrice(
  prisma: Pick<PrismaClient, "shoppingPriceHistory" | "shoppingCatalogItem">,
  userId: string,
  catalogItemId: string,
  input: { storeId: string | null; unitPrice: number; source: string },
): Promise<RecordPriceResult> {
  if (!(await assertOwnedCatalogItem(prisma, userId, catalogItemId))) {
    return { ok: false, error: "Catalog item not found" };
  }
  const price = await prisma.shoppingPriceHistory.create({ data: { userId, catalogItemId, ...input } });
  return { ok: true, id: price.id };
}

export async function getLatestPrice(
  prisma: Pick<PrismaClient, "shoppingPriceHistory">,
  userId: string,
  catalogItemId: string,
  storeId?: string,
) {
  if (storeId) {
    const sameStore = await prisma.shoppingPriceHistory.findFirst({
      where: { userId, catalogItemId, storeId },
      orderBy: { confirmedAt: "desc" },
    });
    if (sameStore) return sameStore;
  }
  return prisma.shoppingPriceHistory.findFirst({
    where: { userId, catalogItemId },
    orderBy: { confirmedAt: "desc" },
  });
}

export async function getPriceHistory(
  prisma: Pick<PrismaClient, "shoppingPriceHistory">,
  userId: string,
  catalogItemId: string,
) {
  return prisma.shoppingPriceHistory.findMany({
    where: { userId, catalogItemId },
    orderBy: { confirmedAt: "desc" },
  });
}

// Feeds Quick Capture's shopping-item resolution the same
// {id, name}[] candidate shape listAccounts/listCategories already
// provide for account/category resolution.
export async function listActiveCatalogItems(
  prisma: Pick<PrismaClient, "shoppingCatalogItem">,
  userId: string,
): Promise<{ id: string; name: string }[]> {
  const items = await prisma.shoppingCatalogItem.findMany({
    where: { userId, archivedAt: null },
    select: { id: true, canonicalName: true },
  });
  return items.map((item: { id: string; canonicalName: string }) => ({ id: item.id, name: item.canonicalName }));
}
