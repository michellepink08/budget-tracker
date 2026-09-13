import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { buildTransactionExportRows, TRANSACTION_EXPORT_COLUMNS } from "@/lib/export-transactions";
import { toCsv, toJson, toXlsx } from "@/lib/export-format";
import type { TransactionFilters } from "@/lib/transactions";

const CONTENT_TYPES: Record<string, string> = {
  csv: "text/csv; charset=utf-8",
  json: "application/json; charset=utf-8",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

function parseDate(value: string | null): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const format = params.get("format") ?? "";
  if (!["csv", "json", "xlsx"].includes(format)) {
    return NextResponse.json({ error: "Invalid format" }, { status: 400 });
  }

  const filters: TransactionFilters = {
    accountId: params.get("accountId") ?? undefined,
    categoryId: params.get("categoryId") ?? undefined,
    type: params.get("type") ?? undefined,
    dateFrom: parseDate(params.get("dateFrom")),
    dateTo: parseDate(params.get("dateTo")),
  };

  const rows = await buildTransactionExportRows(prisma, session.user.id, filters);

  const body: BodyInit =
    format === "csv"
      ? toCsv(TRANSACTION_EXPORT_COLUMNS, rows)
      : format === "json"
        ? toJson(rows)
        : new Uint8Array(await toXlsx("Transactions", TRANSACTION_EXPORT_COLUMNS, rows));

  return new NextResponse(body, {
    headers: {
      "Content-Type": CONTENT_TYPES[format],
      "Content-Disposition": `attachment; filename="transactions.${format}"`,
    },
  });
}
