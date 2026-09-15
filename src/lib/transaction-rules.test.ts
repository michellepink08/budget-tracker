import { describe, expect, it } from "vitest";
import { accountEffect, signedAmountForType } from "@/lib/transaction-rules";

describe("signedAmountForType", () => {
  it("keeps inflow types positive", () => {
    expect(signedAmountForType("INCOME", 5000)).toBe(5000);
    expect(signedAmountForType("REFUND", 1200)).toBe(1200);
  });

  it("negates outflow types", () => {
    expect(signedAmountForType("EXPENSE", 5000)).toBe(-5000);
    expect(signedAmountForType("SAVINGS", 2000)).toBe(-2000);
    expect(signedAmountForType("LOAN_PAYMENT", 3000)).toBe(-3000);
    expect(signedAmountForType("CREDIT_CARD_PAYMENT", 4000)).toBe(-4000);
    expect(signedAmountForType("TRANSFER_FEE", 150)).toBe(-150);
  });

  it("returns a negative amount for LENDING (an outflow — money leaving to lend to someone)", () => {
    expect(signedAmountForType("LENDING", 50000)).toBe(-50000);
  });

  it("rejects a negative magnitude", () => {
    expect(() => signedAmountForType("EXPENSE", -100)).toThrow();
  });
});

describe("accountEffect", () => {
  it("returns the transaction's amount when it belongs to the queried account", () => {
    expect(accountEffect({ accountId: "acc-1", amount: 5000 }, "acc-1")).toBe(5000);
    expect(accountEffect({ accountId: "acc-1", amount: -2000 }, "acc-1")).toBe(-2000);
  });

  it("returns 0 for an unrelated account", () => {
    expect(accountEffect({ accountId: "acc-1", amount: 5000 }, "acc-2")).toBe(0);
  });
});
