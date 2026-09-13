import { describe, expect, it, vi } from "vitest";
import { buildYearPlanExportRows, YEAR_PLAN_EXPORT_COLUMNS } from "@/lib/export-year-plan";

function makeFakePrisma(plans: unknown[]) {
  return {
    yearPlan: { findMany: vi.fn().mockResolvedValue(plans) },
  } as any;
}

describe("buildYearPlanExportRows", () => {
  it("maps each plan's assumptions and linked vacation-reserve goal into a flat row", async () => {
    const prisma = makeFakePrisma([
      {
        id: "plan-1",
        name: "2026 trip home",
        startDate: new Date(2026, 0, 1),
        endDate: new Date(2026, 11, 31),
        minCashBuffer: 500000,
        scenario: "EXPECTED",
        vacationReserveGoal: { targetAmount: 2000000, assignedAmount: 800000 },
      },
    ]);

    const rows = await buildYearPlanExportRows(prisma, "user-1", "PHP");

    expect(rows).toEqual([
      {
        name: "2026 trip home",
        startDate: "2026-01-01",
        endDate: "2026-12-31",
        minCashBufferMajorUnits: 5000,
        scenario: "EXPECTED",
        currency: "PHP",
        vacationReserveTargetMajorUnits: 20000,
        vacationReserveAssignedMajorUnits: 8000,
      },
    ]);
  });

  it("renders vacation-reserve fields as null when no goal is linked", async () => {
    const prisma = makeFakePrisma([
      {
        id: "plan-1",
        name: "No goal yet",
        startDate: new Date(2026, 0, 1),
        endDate: new Date(2026, 11, 31),
        minCashBuffer: 0,
        scenario: "EXPECTED",
        vacationReserveGoal: null,
      },
    ]);

    const rows = await buildYearPlanExportRows(prisma, "user-1", "PHP");

    expect(rows[0].vacationReserveTargetMajorUnits).toBeNull();
    expect(rows[0].vacationReserveAssignedMajorUnits).toBeNull();
  });

  it("scopes to the given user", async () => {
    const prisma = makeFakePrisma([]);

    await buildYearPlanExportRows(prisma, "user-1", "PHP");

    expect(prisma.yearPlan.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      include: { vacationReserveGoal: true },
      orderBy: { startDate: "asc" },
    });
  });

  it("exports the exact column order expected by CSV/XLSX", () => {
    expect(YEAR_PLAN_EXPORT_COLUMNS).toEqual([
      "name",
      "startDate",
      "endDate",
      "minCashBufferMajorUnits",
      "scenario",
      "currency",
      "vacationReserveTargetMajorUnits",
      "vacationReserveAssignedMajorUnits",
    ]);
  });
});
