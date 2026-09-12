import { describe, expect, it } from "vitest";
import { parseAmountMajorUnits } from "@/lib/quick-capture/parse-amount";

describe("parseAmountMajorUnits", () => {
  it("parses a plain integer", () => {
    expect(parseAmountMajorUnits("Paid 180 for food using cash")).toBe(180);
  });

  it("parses a decimal amount", () => {
    expect(parseAmountMajorUnits("My current BPI Savings balance is 166232.27")).toBeCloseTo(166232.27);
  });

  it("parses an amount with thousands separators", () => {
    expect(parseAmountMajorUnits("Transferred 1,000 from BPI to GCash")).toBe(1000);
  });

  it("parses a thousands-separated decimal amount", () => {
    expect(parseAmountMajorUnits("My current BPI Savings balance is 166,232.27")).toBeCloseTo(166232.27);
  });

  it("returns null when no amount-like number is present", () => {
    expect(parseAmountMajorUnits("How much cash do I have left?")).toBeNull();
  });
});
