import { describe, expect, it } from "vitest";
import { buildMonthlyPlanSummary } from "@/lib/monthly-plan";

describe("buildMonthlyPlanSummary", () => {
  it("compares expected income and planned spending with actuals", () => {
    expect(buildMonthlyPlanSummary({ expectedIncome: 5000000, actualIncome: 4800000, plannedSpending: 3200000, actualSpending: 3500000 })).toEqual({ incomeDifference: -200000, spendingDifference: 300000, unallocated: 1800000 });
  });
});
