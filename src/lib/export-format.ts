import ExcelJS from "exceljs";

function csvField(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function toCsv(columns: string[], rows: Record<string, unknown>[]): string {
  const header = columns.join(",");
  const lines = rows.map((row) => columns.map((col) => csvField(row[col])).join(","));
  return [header, ...lines].join("\n") + "\n";
}

export function toJson(rows: unknown[]): string {
  return JSON.stringify(rows, null, 2);
}

export async function toXlsx(
  sheetName: string,
  columns: string[],
  rows: Record<string, unknown>[],
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);
  sheet.addRow(columns);
  for (const row of rows) {
    sheet.addRow(columns.map((col) => row[col]));
  }
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
