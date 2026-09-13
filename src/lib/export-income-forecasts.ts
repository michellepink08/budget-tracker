import type { PrismaClient } from "@prisma/client";
import { toMajorUnits } from "@/lib/money";

function formatDateLocal(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export type IncomeForecastExportRow = {
  yearPlanName: string;
  source: string;
  expectedDate: string;
  expectedAmountMajorUnits: number;
  cutoffLabel: string;
  status: string;
  notes: string | null;
  currency: string;
};

export const INCOME_FORECAST_EXPORT_COLUMNS: (keyof IncomeForecastExportRow)[] = [
  "yearPlanName",
  "source",
  "expectedDate",
  "expectedAmountMajorUnits",
  "cutoffLabel",
  "status",
  "notes",
  "currency",
];

export async function buildIncomeForecastExportRows(
  prisma: Pick<PrismaClient, "incomeForecast">,
  userId: string,
  currency: string,
): Promise<IncomeForecastExportRow[]> {
  const forecasts = await prisma.incomeForecast.findMany({
    where: { userId },
    include: { yearPlan: true },
    orderBy: { expectedDate: "asc" },
  });

  return (
    forecasts as unknown as {
      source: string;
      expectedDate: Date;
      expectedAmount: number;
      cutoffLabel: string;
      status: string;
      notes: string | null;
      yearPlan: { name: string };
    }[]
  ).map((forecast) => ({
    yearPlanName: forecast.yearPlan.name,
    source: forecast.source,
    expectedDate: formatDateLocal(forecast.expectedDate),
    expectedAmountMajorUnits: toMajorUnits(forecast.expectedAmount, currency),
    cutoffLabel: forecast.cutoffLabel,
    status: forecast.status,
    notes: forecast.notes,
    currency,
  }));
}
