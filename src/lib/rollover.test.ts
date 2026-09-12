import { describe, expect, it } from "vitest";
import { computeRolloverAmount } from "@/lib/rollover";

describe("computeRolloverAmount", () => {
  it("NONE never carries anything", () => {
    expect(computeRolloverAmount("NONE", 10000, 6000)).toBe(0); // underspent
    expect(computeRolloverAmount("NONE", 10000, 15000)).toBe(0); // overspent
  });

  it("CARRY_UNUSED carries leftover budget but not overspending", () => {
    expect(computeRolloverAmount("CARRY_UNUSED", 10000, 6000)).toBe(4000);
    expect(computeRolloverAmount("CARRY_UNUSED", 10000, 15000)).toBe(0);
  });

  it("CARRY_OVERSPEND carries overspending but not leftover budget", () => {
    expect(computeRolloverAmount("CARRY_OVERSPEND", 10000, 15000)).toBe(-5000);
    expect(computeRolloverAmount("CARRY_OVERSPEND", 10000, 6000)).toBe(0);
  });

  it("CARRY_BOTH always carries the full difference, either direction", () => {
    expect(computeRolloverAmount("CARRY_BOTH", 10000, 6000)).toBe(4000);
    expect(computeRolloverAmount("CARRY_BOTH", 10000, 15000)).toBe(-5000);
  });

  it("carries exactly 0 when actual equals effective planned, regardless of mode", () => {
    expect(computeRolloverAmount("CARRY_BOTH", 10000, 10000)).toBe(0);
  });
});
