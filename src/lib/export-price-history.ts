import type { PrismaClient } from "@prisma/client";
import { toMajorUnits } from "@/lib/money";

function formatDateLocal(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export type PriceHistoryExportRow = {
  itemName: string;
  store: string | null;
  unitPriceMajorUnits: number;
  confirmedAt: string;
  source: string;
  currency: string;
};

export const PRICE_HISTORY_EXPORT_COLUMNS: (keyof PriceHistoryExportRow)[] = [
  "itemName",
  "store",
  "unitPriceMajorUnits",
  "confirmedAt",
  "source",
  "currency",
];

export async function buildPriceHistoryExportRows(
  prisma: Pick<PrismaClient, "shoppingPriceHistory">,
  userId: string,
  currency: string,
): Promise<PriceHistoryExportRow[]> {
  const rows = await prisma.shoppingPriceHistory.findMany({
    where: { userId },
    include: { catalogItem: true, store: true },
    orderBy: { confirmedAt: "desc" },
  });

  return (
    rows as unknown as {
      unitPrice: number;
      confirmedAt: Date;
      source: string;
      catalogItem: { canonicalName: string };
      store: { name: string } | null;
    }[]
  ).map((row) => ({
    itemName: row.catalogItem.canonicalName,
    store: row.store?.name ?? null,
    unitPriceMajorUnits: toMajorUnits(row.unitPrice, currency),
    confirmedAt: formatDateLocal(row.confirmedAt),
    source: row.source,
    currency,
  }));
}
