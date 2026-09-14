import { describe, expect, it } from "vitest";
import { fromAnnualInterestRate, toAnnualInterestRate } from "@/lib/interest-rate";

describe("toAnnualInterestRate", () => {
  it("passes an annual rate through unchanged", () => {
    expect(toAnnualInterestRate(12, "ANNUAL")).toBe(12);
  });

  it("multiplies a monthly rate by 12 to get the annual rate", () => {
    expect(toAnnualInterestRate(1, "MONTHLY")).toBe(12);
    expect(toAnnualInterestRate(0.5, "MONTHLY")).toBe(6);
  });
});

describe("fromAnnualInterestRate", () => {
  it("passes an annual rate through unchanged", () => {
    expect(fromAnnualInterestRate(12, "ANNUAL")).toBe(12);
  });

  it("divides an annual rate by 12 to get the monthly rate", () => {
    expect(fromAnnualInterestRate(12, "MONTHLY")).toBe(1);
    expect(fromAnnualInterestRate(6, "MONTHLY")).toBe(0.5);
  });

  it("round-trips with toAnnualInterestRate", () => {
    expect(toAnnualInterestRate(fromAnnualInterestRate(18, "MONTHLY"), "MONTHLY")).toBeCloseTo(18);
  });
});
