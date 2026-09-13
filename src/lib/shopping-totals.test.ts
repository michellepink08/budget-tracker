import { describe, expect, it } from "vitest";
import { computeEstimatedTotals } from "@/lib/shopping-totals";

describe("computeEstimatedTotals", () => {
  it("sums only selected items with a known price", () => {
    const result = computeEstimatedTotals({
      items: [
        { isSelected: true, quantity: 2, estimatedUnitPrice: 5000 }, // 10000
        { isSelected: true, quantity: 1, estimatedUnitPrice: null }, // missing price
        { isSelected: false, quantity: 3, estimatedUnitPrice: 2000 }, // unselected
      ],
      allowance: null,
    });
    expect(result.estimatedTotal).toBe(10000);
    expect(result.hasMissingPrice).toBe(true);
    expect(result.overBudget).toBeNull();
  });

  it("does not flag hasMissingPrice for an unselected item with no price", () => {
    const result = computeEstimatedTotals({
      items: [{ isSelected: false, quantity: 1, estimatedUnitPrice: null }],
      allowance: null,
    });
    expect(result.hasMissingPrice).toBe(false);
  });

  it("flags overBudget when the total exceeds the allowance", () => {
    const result = computeEstimatedTotals({
      items: [{ isSelected: true, quantity: 1, estimatedUnitPrice: 10000 }],
      allowance: 5000,
    });
    expect(result.overBudget).toBe(true);
  });

  it("does not flag overBudget when the total is within the allowance", () => {
    const result = computeEstimatedTotals({
      items: [{ isSelected: true, quantity: 1, estimatedUnitPrice: 3000 }],
      allowance: 5000,
    });
    expect(result.overBudget).toBe(false);
  });

  it("returns 0/false/null for an empty list", () => {
    const result = computeEstimatedTotals({ items: [], allowance: null });
    expect(result).toEqual({ estimatedTotal: 0, hasMissingPrice: false, overBudget: null });
  });
});
