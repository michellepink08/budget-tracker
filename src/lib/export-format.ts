import ExcelJS from "exceljs";
import type { TransactionExportRow } from "@/lib/export-transactions";

const COLUMNS: (keyof TransactionExportRow)[] = [
  "date",
  "type",
  "amountMajorUnits",
  "currency",
  "account",
  "destinationAccount",
  "category",
  "description",
  "notes",
];

function csvField(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function toCsv(rows: TransactionExportRow[]): string {
  const header = COLUMNS.join(",");
  const lines = rows.map((row) => COLUMNS.map((col) => csvField(row[col])).join(","));
  return [header, ...lines].join("\n") + "\n";
}

export function toJson(rows: TransactionExportRow[]): string {
  return JSON.stringify(rows, null, 2);
}

export async function toXlsx(rows: TransactionExportRow[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Transactions");
  sheet.addRow(COLUMNS as string[]);
  for (const row of rows) {
    sheet.addRow(COLUMNS.map((col) => row[col]));
  }
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
