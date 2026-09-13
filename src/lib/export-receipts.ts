import type { PrismaClient } from "@prisma/client";
import { toMajorUnits } from "@/lib/money";

function formatDateLocal(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export type ReceiptExportRow = {
  purchaseDate: string | null;
  store: string | null;
  status: string;
  itemName: string;
  quantity: number;
  unitPriceMajorUnits: number | null;
  lineTotalMajorUnits: number;
  excluded: boolean;
  currency: string;
};

export const RECEIPT_EXPORT_COLUMNS: (keyof ReceiptExportRow)[] = [
  "purchaseDate",
  "store",
  "status",
  "itemName",
  "quantity",
  "unitPriceMajorUnits",
  "lineTotalMajorUnits",
  "excluded",
  "currency",
];

// Deliberately never touches ReceiptImage — a receipt's images are
// represented only by their objectKey pointer, and only in the JSON full
// backup (src/lib/export-backup.ts), never here and never as bytes.
export async function buildPurchaseExportRows(
  prisma: Pick<PrismaClient, "receiptLine">,
  userId: string,
  currency: string,
): Promise<ReceiptExportRow[]> {
  const lines = await prisma.receiptLine.findMany({
    where: { userId },
    include: { receipt: { include: { store: true } } },
    orderBy: { receipt: { purchaseDate: "desc" } },
  });

  return (
    lines as unknown as {
      name: string;
      quantity: number;
      unitPrice: number | null;
      lineTotal: number;
      excluded: boolean;
      receipt: { purchaseDate: Date | null; status: string; store: { name: string } | null };
    }[]
  ).map((line) => ({
    purchaseDate: line.receipt.purchaseDate ? formatDateLocal(line.receipt.purchaseDate) : null,
    store: line.receipt.store?.name ?? null,
    status: line.receipt.status,
    itemName: line.name,
    quantity: line.quantity,
    unitPriceMajorUnits: line.unitPrice !== null ? toMajorUnits(line.unitPrice, currency) : null,
    lineTotalMajorUnits: toMajorUnits(line.lineTotal, currency),
    excluded: line.excluded,
    currency,
  }));
}
