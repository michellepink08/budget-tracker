import { describe, expect, it } from "vitest";
import { onboardingSchema } from "@/lib/validations/onboarding";

describe("onboardingSchema", () => {
  it("accepts a valid cycle start day and currency", () => {
    const result = onboardingSchema.safeParse({
      cycleStartDay: 25,
      currency: "PHP",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a cycle start day below 1", () => {
    const result = onboardingSchema.safeParse({
      cycleStartDay: 0,
      currency: "PHP",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a cycle start day above 31", () => {
    const result = onboardingSchema.safeParse({
      cycleStartDay: 32,
      currency: "PHP",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty currency", () => {
    const result = onboardingSchema.safeParse({
      cycleStartDay: 25,
      currency: "",
    });
    expect(result.success).toBe(false);
  });
});
