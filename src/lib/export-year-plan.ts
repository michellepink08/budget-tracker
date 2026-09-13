import type { PrismaClient } from "@prisma/client";
import { toMajorUnits } from "@/lib/money";

function formatDateLocal(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export type YearPlanExportRow = {
  name: string;
  startDate: string;
  endDate: string;
  minCashBufferMajorUnits: number;
  scenario: string;
  currency: string;
  vacationReserveTargetMajorUnits: number | null;
  vacationReserveAssignedMajorUnits: number | null;
};

export const YEAR_PLAN_EXPORT_COLUMNS: (keyof YearPlanExportRow)[] = [
  "name",
  "startDate",
  "endDate",
  "minCashBufferMajorUnits",
  "scenario",
  "currency",
  "vacationReserveTargetMajorUnits",
  "vacationReserveAssignedMajorUnits",
];

export async function buildYearPlanExportRows(
  prisma: Pick<PrismaClient, "yearPlan">,
  userId: string,
  currency: string,
): Promise<YearPlanExportRow[]> {
  const plans = await prisma.yearPlan.findMany({
    where: { userId },
    include: { vacationReserveGoal: true },
    orderBy: { startDate: "asc" },
  });

  return (
    plans as unknown as {
      name: string;
      startDate: Date;
      endDate: Date;
      minCashBuffer: number;
      scenario: string;
      vacationReserveGoal: { targetAmount: number | null; assignedAmount: number } | null;
    }[]
  ).map((plan) => ({
    name: plan.name,
    startDate: formatDateLocal(plan.startDate),
    endDate: formatDateLocal(plan.endDate),
    minCashBufferMajorUnits: toMajorUnits(plan.minCashBuffer, currency),
    scenario: plan.scenario,
    currency,
    vacationReserveTargetMajorUnits:
      plan.vacationReserveGoal?.targetAmount != null
        ? toMajorUnits(plan.vacationReserveGoal.targetAmount, currency)
        : null,
    vacationReserveAssignedMajorUnits: plan.vacationReserveGoal
      ? toMajorUnits(plan.vacationReserveGoal.assignedAmount, currency)
      : null,
  }));
}
