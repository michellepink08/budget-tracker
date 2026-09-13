import { describe, expect, it, vi } from "vitest";
import { buildIncomeForecastExportRows } from "@/lib/export-income-forecasts";

function makeFakePrisma(forecasts: unknown[]) {
  return {
    incomeForecast: { findMany: vi.fn().mockResolvedValue(forecasts) },
  } as any;
}

describe("buildIncomeForecastExportRows", () => {
  it("maps each forecast into a flat row, joined with its plan's name", async () => {
    const prisma = makeFakePrisma([
      {
        source: "Salary",
        expectedDate: new Date(2026, 2, 15),
        expectedAmount: 5000000,
        cutoffLabel: "March 1-15",
        status: "EXPECTED",
        notes: null,
        yearPlan: { name: "2026 trip home" },
      },
    ]);

    const rows = await buildIncomeForecastExportRows(prisma, "user-1", "PHP");

    expect(rows).toEqual([
      {
        yearPlanName: "2026 trip home",
        source: "Salary",
        expectedDate: "2026-03-15",
        expectedAmountMajorUnits: 50000,
        cutoffLabel: "March 1-15",
        status: "EXPECTED",
        notes: null,
        currency: "PHP",
      },
    ]);
  });

  it("scopes to the given user", async () => {
    const prisma = makeFakePrisma([]);

    await buildIncomeForecastExportRows(prisma, "user-1", "PHP");

    expect(prisma.incomeForecast.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      include: { yearPlan: true },
      orderBy: { expectedDate: "asc" },
    });
  });
});
