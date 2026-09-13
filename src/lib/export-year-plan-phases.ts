import type { PrismaClient } from "@prisma/client";
import { toMajorUnits } from "@/lib/money";

function formatDateLocal(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export type YearPlanPhaseExportRow = {
  yearPlanName: string;
  phaseType: string;
  startDate: string;
  endDate: string;
  label: string | null;
  estimatedExpensesPerCutoffMajorUnits: number;
  currency: string;
};

export const YEAR_PLAN_PHASE_EXPORT_COLUMNS: (keyof YearPlanPhaseExportRow)[] = [
  "yearPlanName",
  "phaseType",
  "startDate",
  "endDate",
  "label",
  "estimatedExpensesPerCutoffMajorUnits",
  "currency",
];

export async function buildYearPlanPhaseExportRows(
  prisma: Pick<PrismaClient, "yearPlanPhase">,
  userId: string,
  currency: string,
): Promise<YearPlanPhaseExportRow[]> {
  const phases = await prisma.yearPlanPhase.findMany({
    where: { userId },
    include: { yearPlan: true },
    orderBy: { startDate: "asc" },
  });

  return (
    phases as unknown as {
      phaseType: string;
      startDate: Date;
      endDate: Date;
      label: string | null;
      estimatedExpensesPerCutoff: number;
      yearPlan: { name: string };
    }[]
  ).map((phase) => ({
    yearPlanName: phase.yearPlan.name,
    phaseType: phase.phaseType,
    startDate: formatDateLocal(phase.startDate),
    endDate: formatDateLocal(phase.endDate),
    label: phase.label,
    estimatedExpensesPerCutoffMajorUnits: toMajorUnits(phase.estimatedExpensesPerCutoff, currency),
    currency,
  }));
}
