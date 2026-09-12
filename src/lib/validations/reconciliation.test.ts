import { describe, expect, it } from "vitest";
import { reconciliationSchema } from "@/lib/validations/reconciliation";

describe("reconciliationSchema", () => {
  it("accepts a valid actual balance, including zero or negative (e.g. an overdrawn account)", () => {
    expect(reconciliationSchema.safeParse({ actualBalance: 100.5 }).success).toBe(true);
    expect(reconciliationSchema.safeParse({ actualBalance: 0 }).success).toBe(true);
    expect(reconciliationSchema.safeParse({ actualBalance: -50 }).success).toBe(true);
  });

  it("rejects a non-numeric actual balance", () => {
    const result = reconciliationSchema.safeParse({ actualBalance: "abc" });
    expect(result.success).toBe(false);
  });
});
