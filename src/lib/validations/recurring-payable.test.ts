import { describe, expect, it } from "vitest";
import { recurringPayableSchema } from "@/lib/validations/recurring-payable";

describe("recurringPayableSchema", () => {
  it("accepts a valid MONTHLY rule", () => {
    const result = recurringPayableSchema.safeParse({
      name: "Internet bill",
      amount: 1999,
      frequency: "MONTHLY",
      nextDueDate: new Date(),
      accountId: "acc-1",
    });
    expect(result.success).toBe(true);
  });

  it("requires intervalDays when frequency is CUSTOM", () => {
    const result = recurringPayableSchema.safeParse({
      name: "Every 10 days",
      amount: 500,
      frequency: "CUSTOM",
      nextDueDate: new Date(),
      accountId: "acc-1",
    });
    expect(result.success).toBe(false);
  });

  it("accepts CUSTOM with a positive intervalDays", () => {
    const result = recurringPayableSchema.safeParse({
      name: "Every 10 days",
      amount: 500,
      frequency: "CUSTOM",
      intervalDays: 10,
      nextDueDate: new Date(),
      accountId: "acc-1",
    });
    expect(result.success).toBe(true);
  });
});
