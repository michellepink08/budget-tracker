import { describe, expect, it } from "vitest";
import {
  computeHomeCutoffCashFlow,
  computeRecommendedSavingPerCutoff,
  computeRemainingReserve,
  computeRequiredReserve,
  projectYearPlanCutoffs,
} from "@/lib/year-plan-reserve";

describe("computeHomeCutoffCashFlow", () => {
  it("is reliable income minus planned expenses", () => {
    expect(computeHomeCutoffCashFlow({ reliableIncome: 3500000, plannedExpenses: 4800000 })).toBe(-1300000);
  });
});

describe("computeRequiredReserve", () => {
  it("matches the design doc's worked example: 3 cutoffs at -13k, then +20k, buffer 20k -> 59k", () => {
    const cashFlows = [-1300000, -1300000, -1300000, 2000000];
    const required = computeRequiredReserve({ cashFlows, currentReserveAmount: 0, minCashBuffer: 2000000 });
    expect(required).toBe(5900000);
  });

  it("returns 0 when the plan never dips below the buffer", () => {
    const cashFlows = [500000, 500000];
    const required = computeRequiredReserve({ cashFlows, currentReserveAmount: 0, minCashBuffer: 200000 });
    expect(required).toBe(0);
  });

  it("returns 0 for a plan with no home cutoffs yet", () => {
    const required = computeRequiredReserve({ cashFlows: [], currentReserveAmount: 0, minCashBuffer: 200000 });
    expect(required).toBe(0);
  });

  it("accounts for a nonzero currentReserveAmount already cushioning the cumulative walk", () => {
    const cashFlows = [-1300000, -1300000, -1300000, 2000000];
    const required = computeRequiredReserve({ cashFlows, currentReserveAmount: 1000000, minCashBuffer: 2000000 });
    // worst cumulative point is now (1,000,000 - 3,900,000) = -2,900,000 -> required = 2,900,000 + 2,000,000
    expect(required).toBe(4900000);
  });
});

describe("computeRemainingReserve", () => {
  it("subtracts assignedAmount from requiredReserve", () => {
    expect(computeRemainingReserve({ requiredReserve: 5900000, assignedAmount: 1000000 })).toBe(4900000);
  });

  it("floors at 0 when already fully reserved", () => {
    expect(computeRemainingReserve({ requiredReserve: 5900000, assignedAmount: 9000000 })).toBe(0);
  });
});

describe("computeRecommendedSavingPerCutoff", () => {
  it("divides remainingReserve by remainingFullIncomeCutoffs", () => {
    expect(
      computeRecommendedSavingPerCutoff({ remainingReserve: 5900000, remainingFullIncomeCutoffs: 3 }),
    ).toBe(Math.round(5900000 / 3));
  });

  it("returns null when there are no remaining full-income cutoffs (never divide by zero)", () => {
    expect(computeRecommendedSavingPerCutoff({ remainingReserve: 5900000, remainingFullIncomeCutoffs: 0 })).toBeNull();
  });

  it("handles a single remaining cutoff", () => {
    expect(computeRecommendedSavingPerCutoff({ remainingReserve: 1000000, remainingFullIncomeCutoffs: 1 })).toBe(
      1000000,
    );
  });
});

describe("projectYearPlanCutoffs", () => {
  const forecasts = [
    { cutoffLabel: "Cutoff 1", source: "MY_SALARY", status: "EXPECTED", expectedAmount: 3500000, phaseId: "home" },
    { cutoffLabel: "Cutoff 2", source: "MY_SALARY", status: "EXPECTED", expectedAmount: 3500000, phaseId: "home" },
    { cutoffLabel: "Cutoff 3", source: "MY_SALARY", status: "EXPECTED", expectedAmount: 3500000, phaseId: "home" },
    { cutoffLabel: "Cutoff 4", source: "PARTIAL_SALARY", status: "EXPECTED", expectedAmount: 2000000, phaseId: "partial" },
  ];
  const phases = [
    { id: "home", phaseType: "HOME_SALARY_ONLY", estimatedExpensesPerCutoff: 4800000 },
    { id: "partial", phaseType: "PARTIAL_ONBOARD", estimatedExpensesPerCutoff: 0 },
  ];

  it("computes a running closingBalance per cutoff and flags status", () => {
    const rows = projectYearPlanCutoffs({
      forecasts,
      phases,
      currentReserveAmount: 0,
      minCashBuffer: 2000000,
      recommendedSavingPerCutoff: null,
    });
    expect(rows).toHaveLength(4);
    expect(rows[0]).toMatchObject({
      cutoffLabel: "Cutoff 1",
      phaseId: "home",
      reserveDelta: -1300000,
      closingBalance: -1300000,
    });
    expect(rows[2].closingBalance).toBe(-3900000);
    expect(rows[2].status).toBe("below");
    // PARTIAL_SALARY isn't a reliable-income source, so Cutoff 4's reliable
    // income is 0 and its cash flow is 0 - 0 expenses = 0.
    expect(rows[3].reserveDelta).toBe(0);
  });

  it("uses recommendedSavingPerCutoff as the delta for FULL_ONBOARD-phase cutoffs when supplied", () => {
    const fullOnboardForecasts = [
      { cutoffLabel: "Cutoff A", source: "MY_SALARY", status: "EXPECTED", expectedAmount: 5000000, phaseId: "full" },
    ];
    const fullOnboardPhases = [{ id: "full", phaseType: "FULL_ONBOARD", estimatedExpensesPerCutoff: 3000000 }];
    const rows = projectYearPlanCutoffs({
      forecasts: fullOnboardForecasts,
      phases: fullOnboardPhases,
      currentReserveAmount: 0,
      minCashBuffer: 2000000,
      recommendedSavingPerCutoff: 1966700,
    });
    expect(rows[0].reserveDelta).toBe(1966700);
  });

  it("excludes ESTIMATED/UNCERTAIN-status income from reliableIncome", () => {
    const uncertainForecasts = [
      { cutoffLabel: "Cutoff X", source: "MY_SALARY", status: "UNCERTAIN", expectedAmount: 9999999, phaseId: "home" },
    ];
    const rows = projectYearPlanCutoffs({
      forecasts: uncertainForecasts,
      phases,
      currentReserveAmount: 0,
      minCashBuffer: 2000000,
      recommendedSavingPerCutoff: null,
    });
    expect(rows[0].reliableIncome).toBe(0);
  });
});
