import { describe, expect, it, vi } from "vitest";
import { buildYearPlanPhaseExportRows } from "@/lib/export-year-plan-phases";

function makeFakePrisma(phases: unknown[]) {
  return {
    yearPlanPhase: { findMany: vi.fn().mockResolvedValue(phases) },
  } as any;
}

describe("buildYearPlanPhaseExportRows", () => {
  it("maps each phase into a flat row, joined with its plan's name", async () => {
    const prisma = makeFakePrisma([
      {
        phaseType: "SOLO_FIELD",
        startDate: new Date(2026, 0, 1),
        endDate: new Date(2026, 5, 30),
        label: "Deployment",
        estimatedExpensesPerCutoff: 250000,
        yearPlan: { name: "2026 trip home" },
      },
    ]);

    const rows = await buildYearPlanPhaseExportRows(prisma, "user-1", "PHP");

    expect(rows).toEqual([
      {
        yearPlanName: "2026 trip home",
        phaseType: "SOLO_FIELD",
        startDate: "2026-01-01",
        endDate: "2026-06-30",
        label: "Deployment",
        estimatedExpensesPerCutoffMajorUnits: 2500,
        currency: "PHP",
      },
    ]);
  });

  it("scopes to the given user", async () => {
    const prisma = makeFakePrisma([]);

    await buildYearPlanPhaseExportRows(prisma, "user-1", "PHP");

    expect(prisma.yearPlanPhase.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      include: { yearPlan: true },
      orderBy: { startDate: "asc" },
    });
  });
});
