import { describe, expect, it } from "vitest";
import { formatCycleRange, getCurrentCycle, getCycleForDate } from "@/lib/cycle";

function d(year: number, month1based: number, day: number): Date {
  return new Date(Date.UTC(year, month1based - 1, day));
}

describe("getCycleForDate — worked examples from the spec (cycleStartDay = 11)", () => {
  it("uses canonical UTC date stamps so Manila and Vercel reuse the same saved cycle",()=>{
    expect(getCycleForDate(11,new Date("2026-09-17"))).toEqual({start:new Date("2026-09-11"),end:new Date("2026-10-10")});
    expect(getCycleForDate(11,new Date("2026-09-10T16:00:00Z"))).toEqual({start:new Date("2026-09-11"),end:new Date("2026-10-10")});
  });
  it("Sep 10 belongs to Aug 11 - Sep 10", () => {
    const { start, end } = getCycleForDate(11, d(2026, 9, 10));
    expect(start).toEqual(d(2026, 8, 11));
    expect(end).toEqual(d(2026, 9, 10));
  });

  it("Sep 11 belongs to Sep 11 - Oct 10", () => {
    const { start, end } = getCycleForDate(11, d(2026, 9, 11));
    expect(start).toEqual(d(2026, 9, 11));
    expect(end).toEqual(d(2026, 10, 10));
  });

  it("Oct 10 belongs to Sep 11 - Oct 10", () => {
    const { start, end } = getCycleForDate(11, d(2026, 10, 10));
    expect(start).toEqual(d(2026, 9, 11));
    expect(end).toEqual(d(2026, 10, 10));
  });

  it("Oct 11 belongs to Oct 11 - Nov 10", () => {
    const { start, end } = getCycleForDate(11, d(2026, 10, 11));
    expect(start).toEqual(d(2026, 10, 11));
    expect(end).toEqual(d(2026, 11, 10));
  });
});

describe("getCycleForDate — short-month clamping (cycleStartDay = 31)", () => {
  it("clamps to Feb 28 in a non-leap year, and the prior cycle starts Jan 31", () => {
    const { start, end } = getCycleForDate(31, d(2026, 2, 15));
    expect(start).toEqual(d(2026, 1, 31));
    expect(end).toEqual(d(2026, 2, 27));
  });

  it("clamps to Feb 29 in a leap year", () => {
    const { start, end } = getCycleForDate(31, d(2028, 2, 20));
    expect(start).toEqual(d(2028, 1, 31));
    expect(end).toEqual(d(2028, 2, 28));
  });

  it("a date on/after the clamped boundary starts the next cycle there", () => {
    const { start, end } = getCycleForDate(31, d(2026, 2, 28));
    expect(start).toEqual(d(2026, 2, 28));
    expect(end).toEqual(d(2026, 3, 30));
  });

  it("clamps to day 30 in a 30-day month (April)", () => {
    const { start, end } = getCycleForDate(31, d(2026, 4, 15));
    expect(start).toEqual(d(2026, 3, 31));
    expect(end).toEqual(d(2026, 4, 29));
  });
});

describe("getCycleForDate — validation", () => {
  it("rejects a cycleStartDay outside 1-31", () => {
    expect(() => getCycleForDate(0, new Date())).toThrow();
    expect(() => getCycleForDate(32, new Date())).toThrow();
  });
});

describe("getCurrentCycle", () => {
  it("delegates to getCycleForDate using the provided 'now'", () => {
    const now = d(2026, 9, 15);
    expect(getCurrentCycle(11, now)).toEqual(getCycleForDate(11, now));
  });
});

describe("formatCycleRange", () => {
  it("formats a range within the same year", () => {
    expect(formatCycleRange({ start: d(2026, 9, 11), end: d(2026, 10, 10) })).toBe(
      "Sep 11 – Oct 10, 2026",
    );
  });

  it("formats a range spanning two years", () => {
    expect(formatCycleRange({ start: d(2026, 12, 25), end: d(2027, 1, 24) })).toBe(
      "Dec 25, 2026 – Jan 24, 2027",
    );
  });
});
