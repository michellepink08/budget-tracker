import { describe, expect, it, vi } from "vitest";
import { getYearPlanDashboardSummary } from "@/lib/year-plan-summary";

function makeFakePrisma(overrides: Record<string, any> = {}) {
  return {
    yearPlan: { findFirst: vi.fn().mockResolvedValue(null) },
    yearPlanPhase: { findMany: vi.fn().mockResolvedValue([]) },
    incomeForecast: { findMany: vi.fn().mockResolvedValue([]) },
    savingsGoal: { findUnique: vi.fn().mockResolvedValue(null) },
    ...overrides,
  } as any;
}

describe("getYearPlanDashboardSummary", () => {
  it("returns null when the user has no active Year Plan", async () => {
    const prisma = makeFakePrisma();
    const summary = await getYearPlanDashboardSummary(prisma, "user-1");
    expect(summary).toBeNull();
  });

  it("returns the next not-yet-passed forecast and reserve figures for an active plan", async () => {
    const asOf = new Date(2026, 0, 10);
    const prisma = makeFakePrisma({
      yearPlan: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ id: "plan-1", minCashBuffer: 2000000, vacationReserveGoalId: "goal-1" }),
      },
      yearPlanPhase: {
        findMany: vi.fn().mockResolvedValue([{ id: "home", phaseType: "HOME_SALARY_ONLY", estimatedExpensesPerCutoff: 4800000 }]),
      },
      incomeForecast: {
        findMany: vi.fn().mockResolvedValue([
          {
            cutoffLabel: "Cutoff 1",
            source: "MY_SALARY",
            status: "EXPECTED",
            expectedAmount: 3500000,
            expectedDate: new Date(2025, 11, 1),
            phaseId: "home",
          },
          {
            cutoffLabel: "Cutoff 2",
            source: "MY_SALARY",
            status: "EXPECTED",
            expectedAmount: 3500000,
            expectedDate: new Date(2026, 0, 20),
            phaseId: "home",
          },
        ]),
      },
      savingsGoal: { findUnique: vi.fn().mockResolvedValue({ assignedAmount: 500000 }) },
    });

    const summary = await getYearPlanDashboardSummary(prisma, "user-1", asOf);

    expect(summary).not.toBeNull();
    expect(summary!.nextForecast).toMatchObject({ source: "MY_SALARY", expectedAmount: 3500000 });
    expect(summary!.remainingReserve).toBeGreaterThanOrEqual(0);
  });

  it("reports nextForecast as null when every forecast has already passed", async () => {
    const asOf = new Date(2026, 5, 1);
    const prisma = makeFakePrisma({
      yearPlan: { findFirst: vi.fn().mockResolvedValue({ id: "plan-1", minCashBuffer: 0, vacationReserveGoalId: null }) },
      incomeForecast: {
        findMany: vi.fn().mockResolvedValue([
          {
            cutoffLabel: "Cutoff 1",
            source: "MY_SALARY",
            status: "EXPECTED",
            expectedAmount: 3500000,
            expectedDate: new Date(2026, 0, 1),
            phaseId: null,
          },
        ]),
      },
    });

    const summary = await getYearPlanDashboardSummary(prisma, "user-1", asOf);
    expect(summary!.nextForecast).toBeNull();
  });
});
