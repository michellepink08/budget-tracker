import type { PrismaClient } from "@prisma/client";
import { toMajorUnits } from "@/lib/money";

function formatDateLocal(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export type ShoppingListExportRow = {
  listName: string;
  plannedDate: string | null;
  itemName: string;
  quantity: number;
  unit: string | null;
  estimatedUnitPriceMajorUnits: number | null;
  preferredStore: string | null;
  priority: string;
  isSelected: boolean;
  isPurchased: boolean;
  notes: string | null;
  currency: string;
};

export const SHOPPING_LIST_EXPORT_COLUMNS: (keyof ShoppingListExportRow)[] = [
  "listName",
  "plannedDate",
  "itemName",
  "quantity",
  "unit",
  "estimatedUnitPriceMajorUnits",
  "preferredStore",
  "priority",
  "isSelected",
  "isPurchased",
  "notes",
  "currency",
];

export async function buildShoppingExportRows(
  prisma: Pick<PrismaClient, "shoppingListItem">,
  userId: string,
  currency: string,
): Promise<ShoppingListExportRow[]> {
  const items = await prisma.shoppingListItem.findMany({
    where: { userId },
    include: { list: true, catalogItem: true, store: true },
    orderBy: [{ list: { createdAt: "desc" } }, { sortOrder: "asc" }],
  });

  return (
    items as unknown as {
      freeTextName: string | null;
      quantity: number;
      unit: string | null;
      estimatedUnitPrice: number | null;
      priority: string;
      isSelected: boolean;
      isPurchased: boolean;
      notes: string | null;
      list: { name: string; plannedDate: Date | null };
      catalogItem: { canonicalName: string } | null;
      store: { name: string } | null;
    }[]
  ).map((item) => ({
    listName: item.list.name,
    plannedDate: item.list.plannedDate ? formatDateLocal(item.list.plannedDate) : null,
    itemName: item.catalogItem?.canonicalName ?? item.freeTextName ?? "",
    quantity: item.quantity,
    unit: item.unit,
    estimatedUnitPriceMajorUnits:
      item.estimatedUnitPrice !== null ? toMajorUnits(item.estimatedUnitPrice, currency) : null,
    preferredStore: item.store?.name ?? null,
    priority: item.priority,
    isSelected: item.isSelected,
    isPurchased: item.isPurchased,
    notes: item.notes,
    currency,
  }));
}
