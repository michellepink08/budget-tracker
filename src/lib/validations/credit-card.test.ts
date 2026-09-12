import { describe, expect, it } from "vitest";
import { creditCardSchema } from "@/lib/validations/credit-card";

describe("creditCardSchema", () => {
  it("accepts a valid credit card", () => {
    const result = creditCardSchema.safeParse({
      accountId: "acc-1",
      creditLimit: 100000,
      statementDay: 15,
      paymentDueDay: 5,
      interestRate: 24,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a zero or negative credit limit", () => {
    const result = creditCardSchema.safeParse({
      accountId: "acc-1",
      creditLimit: 0,
      statementDay: 15,
      paymentDueDay: 5,
      interestRate: 24,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a statementDay outside 1-31", () => {
    const result = creditCardSchema.safeParse({
      accountId: "acc-1",
      creditLimit: 100000,
      statementDay: 32,
      paymentDueDay: 5,
      interestRate: 24,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a paymentDueDay outside 1-31", () => {
    const result = creditCardSchema.safeParse({
      accountId: "acc-1",
      creditLimit: 100000,
      statementDay: 15,
      paymentDueDay: 0,
      interestRate: 24,
    });
    expect(result.success).toBe(false);
  });
});
