import { describe, expect, it } from "vitest";
import { computeDailyAllowances, daysLeftInPeriod } from "@/lib/daily-allowance";

describe("daysLeftInPeriod", () => {
  it("counts today itself as 1 day left when today is the period's last day", () => {
    expect(daysLeftInPeriod(new Date(2026, 8, 30), new Date(2026, 8, 30))).toBe(1);
  });

  it("counts inclusively from today through the period end", () => {
    expect(daysLeftInPeriod(new Date(2026, 8, 28), new Date(2026, 8, 30))).toBe(3);
  });

  it("clamps to a minimum of 1 when today is past the period end", () => {
    expect(daysLeftInPeriod(new Date(2026, 9, 2), new Date(2026, 8, 30))).toBe(1);
  });

  it("ignores time-of-day when comparing dates", () => {
    const today = new Date(2026, 8, 28, 23, 45);
    const periodEnd = new Date(2026, 8, 30, 0, 5);
    expect(daysLeftInPeriod(today, periodEnd)).toBe(3);
  });
});

describe("computeDailyAllowances", () => {
  const periodEnd = new Date(2026, 8, 30);
  const today = new Date(2026, 8, 28); // 3 days left, inclusive

  it("only includes allocations flagged showDailyAllowance", () => {
    const rows = computeDailyAllowances(
      [
        {
          id: "alloc-1",
          category: { name: "Home & Groceries" },
          subcategoryName: "Market / Grocery / Food",
          showDailyAllowance: true,
          remaining: 9000,
        },
        {
          id: "alloc-2",
          category: { name: "Utilities/Transpo/Subscription" },
          subcategoryName: null,
          showDailyAllowance: false,
          remaining: 5000,
        },
      ],
      periodEnd,
      today,
    );

    expect(rows).toEqual([
      { id: "alloc-1", label: "Home & Groceries — Market / Grocery / Food", amount: 3000 },
    ]);
  });

  it("labels a whole-category allocation with just the category name", () => {
    const rows = computeDailyAllowances(
      [
        {
          id: "alloc-1",
          category: { name: "Home & Groceries" },
          subcategoryName: null,
          showDailyAllowance: true,
          remaining: 6000,
        },
      ],
      periodEnd,
      today,
    );

    expect(rows).toEqual([{ id: "alloc-1", label: "Home & Groceries", amount: 2000 }]);
  });

  it("can be negative when the allocation is already over budget", () => {
    const rows = computeDailyAllowances(
      [
        {
          id: "alloc-1",
          category: { name: "Home & Groceries" },
          subcategoryName: null,
          showDailyAllowance: true,
          remaining: -3000,
        },
      ],
      periodEnd,
      today,
    );

    expect(rows).toEqual([{ id: "alloc-1", label: "Home & Groceries", amount: -1000 }]);
  });
});
