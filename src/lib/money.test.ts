import { describe, expect, it } from "vitest";
import { formatMoney, toMajorUnits, toMinorUnits } from "@/lib/money";

describe("toMinorUnits", () => {
  it("converts a major-unit amount to minor units", () => {
    expect(toMinorUnits(19.99, "PHP")).toBe(1999);
    expect(toMinorUnits(100, "USD")).toBe(10000);
  });
});

describe("toMajorUnits", () => {
  it("converts a minor-unit amount to major units", () => {
    expect(toMajorUnits(1999, "PHP")).toBe(19.99);
    expect(toMajorUnits(10000, "USD")).toBe(100);
  });
});

describe("formatMoney", () => {
  it("formats a positive PHP amount with the peso sign", () => {
    expect(formatMoney(150000, "PHP")).toBe("₱1500.00");
  });

  it("formats a positive USD amount with the dollar sign", () => {
    expect(formatMoney(500, "USD")).toBe("$5.00");
  });

  it("formats a negative amount with a leading minus sign before the currency symbol", () => {
    expect(formatMoney(-500, "USD")).toBe("-$5.00");
  });
});
