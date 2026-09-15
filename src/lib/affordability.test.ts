import { describe, expect, it } from "vitest";
import { checkAffordability } from "@/lib/affordability";

describe("checkAffordability", () => {
  it("can afford it when the amount is less than safe-to-spend", () => {
    const result = checkAffordability(5000, 10000);
    expect(result).toEqual({ canAfford: true, remainingAfter: 5000 });
  });

  it("can afford it exactly when the amount equals safe-to-spend", () => {
    const result = checkAffordability(10000, 10000);
    expect(result).toEqual({ canAfford: true, remainingAfter: 0 });
  });

  it("cannot afford it when the amount exceeds safe-to-spend", () => {
    const result = checkAffordability(12000, 10000);
    expect(result).toEqual({ canAfford: false, remainingAfter: -2000 });
  });

  it("cannot afford anything when safe-to-spend is already negative", () => {
    const result = checkAffordability(100, -500);
    expect(result).toEqual({ canAfford: false, remainingAfter: -600 });
  });
});
