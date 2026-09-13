import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getExportKind } from "@/lib/export-kinds";
import { toCsv, toJson, toXlsx } from "@/lib/export-format";

const CONTENT_TYPES: Record<string, string> = {
  csv: "text/csv; charset=utf-8",
  json: "application/json; charset=utf-8",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

export async function GET(request: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { kind } = await params;
  const entry = getExportKind(kind);
  if (!entry) {
    return NextResponse.json({ error: "Unknown export kind" }, { status: 404 });
  }

  const format = request.nextUrl.searchParams.get("format") ?? "";
  if (!["csv", "json", "xlsx"].includes(format)) {
    return NextResponse.json({ error: "Invalid format" }, { status: 400 });
  }

  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.user.id } });
  const rows = await entry.build(prisma, user.id, user.currency);

  const body: BodyInit =
    format === "csv"
      ? toCsv(entry.columns, rows)
      : format === "json"
        ? toJson(rows)
        : new Uint8Array(await toXlsx(entry.sheetName, entry.columns, rows));

  return new NextResponse(body, {
    headers: {
      "Content-Type": CONTENT_TYPES[format],
      "Content-Disposition": `attachment; filename="${kind}.${format}"`,
    },
  });
}
