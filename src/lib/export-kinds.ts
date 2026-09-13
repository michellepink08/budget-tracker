import type { PrismaClient } from "@prisma/client";
import { buildYearPlanExportRows, YEAR_PLAN_EXPORT_COLUMNS } from "@/lib/export-year-plan";
import { buildYearPlanPhaseExportRows, YEAR_PLAN_PHASE_EXPORT_COLUMNS } from "@/lib/export-year-plan-phases";
import { buildIncomeForecastExportRows, INCOME_FORECAST_EXPORT_COLUMNS } from "@/lib/export-income-forecasts";
import { buildCatalogExportRows, SHOPPING_CATALOG_EXPORT_COLUMNS } from "@/lib/export-shopping-catalog";
import { buildShoppingExportRows, SHOPPING_LIST_EXPORT_COLUMNS } from "@/lib/export-shopping-lists";
import { buildPriceHistoryExportRows, PRICE_HISTORY_EXPORT_COLUMNS } from "@/lib/export-price-history";
import { buildPurchaseExportRows, RECEIPT_EXPORT_COLUMNS } from "@/lib/export-receipts";
import { buildCustomReminderExportRows, CUSTOM_REMINDER_EXPORT_COLUMNS } from "@/lib/export-custom-reminders";

export type ExportKindEntry = {
  sheetName: string;
  columns: string[];
  // Every builder takes (prisma, userId, currency) — buildCatalogExportRows
  // is the one exception (no money fields), so it's wrapped to match the
  // same shape and just ignores the currency argument.
  build: (prisma: PrismaClient, userId: string, currency: string) => Promise<Record<string, unknown>[]>;
};

export const EXPORT_KINDS: Record<string, ExportKindEntry> = {
  "year-plan": {
    sheetName: "Year Plan",
    columns: YEAR_PLAN_EXPORT_COLUMNS,
    build: buildYearPlanExportRows,
  },
  "year-plan-phases": {
    sheetName: "Year Plan Phases",
    columns: YEAR_PLAN_PHASE_EXPORT_COLUMNS,
    build: buildYearPlanPhaseExportRows,
  },
  "income-forecasts": {
    sheetName: "Income Forecasts",
    columns: INCOME_FORECAST_EXPORT_COLUMNS,
    build: buildIncomeForecastExportRows,
  },
  "shopping-catalog": {
    sheetName: "Shopping Catalog",
    columns: SHOPPING_CATALOG_EXPORT_COLUMNS,
    build: (prisma, userId) => buildCatalogExportRows(prisma, userId),
  },
  "shopping-lists": {
    sheetName: "Shopping Lists",
    columns: SHOPPING_LIST_EXPORT_COLUMNS,
    build: buildShoppingExportRows,
  },
  "price-history": {
    sheetName: "Price History",
    columns: PRICE_HISTORY_EXPORT_COLUMNS,
    build: buildPriceHistoryExportRows,
  },
  receipts: {
    sheetName: "Receipts",
    columns: RECEIPT_EXPORT_COLUMNS,
    build: buildPurchaseExportRows,
  },
  "custom-reminders": {
    sheetName: "Custom Reminders",
    columns: CUSTOM_REMINDER_EXPORT_COLUMNS,
    build: buildCustomReminderExportRows,
  },
};

export function getExportKind(kind: string): ExportKindEntry | undefined {
  return EXPORT_KINDS[kind];
}
