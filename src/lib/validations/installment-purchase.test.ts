import { describe, expect, it } from "vitest";
import { installmentPurchaseSchema } from "@/lib/validations/installment-purchase";

describe("installmentPurchaseSchema", () => {
  it("accepts a valid installment purchase", () => {
    const result = installmentPurchaseSchema.safeParse({
      name: "New laptop",
      totalAmount: 1000,
      numberOfTerms: 6,
      accountId: "acc-1",
      startDate: new Date(),
    });
    expect(result.success).toBe(true);
  });

  it("rejects a zero or negative totalAmount", () => {
    const result = installmentPurchaseSchema.safeParse({
      name: "Invalid",
      totalAmount: 0,
      numberOfTerms: 6,
      accountId: "acc-1",
      startDate: new Date(),
    });
    expect(result.success).toBe(false);
  });

  it("rejects fewer than 2 terms", () => {
    const result = installmentPurchaseSchema.safeParse({
      name: "Invalid",
      totalAmount: 1000,
      numberOfTerms: 1,
      accountId: "acc-1",
      startDate: new Date(),
    });
    expect(result.success).toBe(false);
  });

  it("rejects more than 60 terms", () => {
    const result = installmentPurchaseSchema.safeParse({
      name: "Invalid",
      totalAmount: 1000,
      numberOfTerms: 61,
      accountId: "acc-1",
      startDate: new Date(),
    });
    expect(result.success).toBe(false);
  });

  it("rejects a non-integer numberOfTerms", () => {
    const result = installmentPurchaseSchema.safeParse({
      name: "Invalid",
      totalAmount: 1000,
      numberOfTerms: 6.5,
      accountId: "acc-1",
      startDate: new Date(),
    });
    expect(result.success).toBe(false);
  });
});
