import type { PrismaClient } from "@prisma/client";

export type CatalogExportRow = {
  canonicalName: string;
  brand: string | null;
  size: string | null;
  unit: string | null;
  defaultQuantity: number;
  isFavorite: boolean;
  category: string | null;
  preferredStore: string | null;
};

export const SHOPPING_CATALOG_EXPORT_COLUMNS: (keyof CatalogExportRow)[] = [
  "canonicalName",
  "brand",
  "size",
  "unit",
  "defaultQuantity",
  "isFavorite",
  "category",
  "preferredStore",
];

export async function buildCatalogExportRows(
  prisma: Pick<PrismaClient, "shoppingCatalogItem">,
  userId: string,
): Promise<CatalogExportRow[]> {
  const items = await prisma.shoppingCatalogItem.findMany({
    where: { userId, archivedAt: null },
    include: { category: true, store: true },
    orderBy: { canonicalName: "asc" },
  });

  return (
    items as unknown as {
      canonicalName: string;
      brand: string | null;
      size: string | null;
      unit: string | null;
      defaultQuantity: number;
      isFavorite: boolean;
      category: { name: string } | null;
      store: { name: string } | null;
    }[]
  ).map((item) => ({
    canonicalName: item.canonicalName,
    brand: item.brand,
    size: item.size,
    unit: item.unit,
    defaultQuantity: item.defaultQuantity,
    isFavorite: item.isFavorite,
    category: item.category?.name ?? null,
    preferredStore: item.store?.name ?? null,
  }));
}
