import { describe, expect, it } from "vitest";
import { recurringRuleSchema } from "@/lib/validations/recurring";

describe("recurringRuleSchema", () => {
  it("accepts a valid MONTHLY rule", () => {
    const result = recurringRuleSchema.safeParse({
      name: "Monthly rent",
      transactionType: "EXPENSE",
      amount: 15000,
      frequency: "MONTHLY",
      nextDate: new Date(),
      accountId: "acc-1",
    });
    expect(result.success).toBe(true);
  });

  it("requires intervalDays when frequency is CUSTOM", () => {
    const result = recurringRuleSchema.safeParse({
      name: "Every 10 days",
      transactionType: "EXPENSE",
      amount: 500,
      frequency: "CUSTOM",
      nextDate: new Date(),
      accountId: "acc-1",
    });
    expect(result.success).toBe(false);
  });

  it("accepts CUSTOM with a positive intervalDays", () => {
    const result = recurringRuleSchema.safeParse({
      name: "Every 10 days",
      transactionType: "EXPENSE",
      amount: 500,
      frequency: "CUSTOM",
      intervalDays: 10,
      nextDate: new Date(),
      accountId: "acc-1",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a zero or negative amount", () => {
    const result = recurringRuleSchema.safeParse({
      name: "Invalid",
      transactionType: "EXPENSE",
      amount: 0,
      frequency: "MONTHLY",
      nextDate: new Date(),
      accountId: "acc-1",
    });
    expect(result.success).toBe(false);
  });
});
