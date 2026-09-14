import { describe, expect, it } from "vitest";
import { computeLoanTermMonths } from "@/lib/loan-term";

describe("computeLoanTermMonths", () => {
  it("counts whole calendar months between start and end", () => {
    expect(computeLoanTermMonths(new Date(2026, 0, 15), new Date(2027, 0, 15))).toBe(12);
    expect(computeLoanTermMonths(new Date(2026, 0, 1), new Date(2026, 5, 1))).toBe(5);
  });

  it("counts across year boundaries", () => {
    expect(computeLoanTermMonths(new Date(2025, 10, 1), new Date(2026, 2, 1))).toBe(4);
  });

  it("never returns a negative term, even if end precedes start", () => {
    expect(computeLoanTermMonths(new Date(2026, 5, 1), new Date(2026, 0, 1))).toBe(0);
  });
});
