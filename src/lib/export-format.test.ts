import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { toCsv, toJson, toXlsx } from "@/lib/export-format";

const COLUMNS = [
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

const rows = [
  {
    date: "2026-09-13",
    type: "EXPENSE",
    amountMajorUnits: -180,
    currency: "PHP",
    account: "Cash",
    destinationAccount: null,
    category: "Food",
    description: "Lunch",
    notes: null,
  },
];

describe("toCsv", () => {
  it("writes a header row and one data row, in the given column order", () => {
    const csv = toCsv(COLUMNS, rows);
    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe(
      "date,type,amountMajorUnits,currency,account,destinationAccount,category,description,notes",
    );
    expect(lines[1]).toBe("2026-09-13,EXPENSE,-180,PHP,Cash,,Food,Lunch,");
  });

  it("escapes a value containing a comma", () => {
    const csv = toCsv(COLUMNS, [{ ...rows[0], description: "Lunch, with tip" }]);
    expect(csv).toContain('"Lunch, with tip"');
  });

  it("escapes a value containing a double quote by doubling it", () => {
    const csv = toCsv(COLUMNS, [{ ...rows[0], notes: 'Said "thanks"' }]);
    expect(csv).toContain('"Said ""thanks"""');
  });

  it("renders a null field as empty, not the string 'null'", () => {
    const csv = toCsv(COLUMNS, rows);
    expect(csv).not.toContain("null");
  });

  it("only emits the columns given, even if a row has extra fields", () => {
    const csv = toCsv(["date", "description"], [{ ...rows[0], secret: "ignore me" }]);
    expect(csv.trim().split("\n")).toEqual(["date,description", "2026-09-13,Lunch"]);
  });
});

describe("toJson", () => {
  it("round-trips to an array with the expected shape", () => {
    const parsed = JSON.parse(toJson(rows));
    expect(parsed).toEqual(rows);
  });
});

describe("toXlsx", () => {
  it("produces a workbook with a worksheet named after the given sheet name", async () => {
    const buffer = await toXlsx("Transactions", COLUMNS, rows);
    expect(buffer.length).toBeGreaterThan(0);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);
    const sheet = workbook.getWorksheet("Transactions");
    expect(sheet).toBeDefined();
    const header = sheet!.getRow(1).values as unknown[];
    expect(header.slice(1)).toEqual(COLUMNS);
    const dataRow = sheet!.getRow(2).values as unknown[];
    expect(dataRow[1]).toBe("2026-09-13");
    expect(dataRow[3]).toBe(-180);
  });
});
