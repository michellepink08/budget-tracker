import { describe, expect, it } from "vitest";
import { advanceNextDate } from "@/lib/recurring-schedule";

function d(year: number, month1based: number, day: number): Date {
  return new Date(year, month1based - 1, day);
}

describe("advanceNextDate — WEEKLY", () => {
  it("adds exactly 7 days", () => {
    expect(advanceNextDate(d(2026, 9, 12), "WEEKLY")).toEqual(d(2026, 9, 19));
  });
});

describe("advanceNextDate — MONTHLY", () => {
  it("adds one calendar month, same day", () => {
    expect(advanceNextDate(d(2026, 9, 15), "MONTHLY")).toEqual(d(2026, 10, 15));
  });

  it("rolls over the year boundary", () => {
    expect(advanceNextDate(d(2026, 12, 10), "MONTHLY")).toEqual(d(2027, 1, 10));
  });

  it("clamps to the last valid day in a shorter month", () => {
    expect(advanceNextDate(d(2026, 1, 31), "MONTHLY")).toEqual(d(2026, 2, 28));
  });

  it("clamps to Feb 29 in a leap year", () => {
    expect(advanceNextDate(d(2028, 1, 31), "MONTHLY")).toEqual(d(2028, 2, 29));
  });
});

describe("advanceNextDate — CUSTOM", () => {
  it("adds the given number of days", () => {
    expect(advanceNextDate(d(2026, 9, 12), "CUSTOM", 10)).toEqual(d(2026, 9, 22));
  });

  it("rejects a missing or non-positive intervalDays", () => {
    expect(() => advanceNextDate(d(2026, 9, 12), "CUSTOM")).toThrow();
    expect(() => advanceNextDate(d(2026, 9, 12), "CUSTOM", 0)).toThrow();
  });
});
