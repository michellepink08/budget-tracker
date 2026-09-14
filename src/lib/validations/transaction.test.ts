import { describe, expect, it } from "vitest";
import { transactionSchema, transferSchema } from "@/lib/validations/transaction";

describe("transactionSchema", () => {
  it("accepts a valid expense", () => {
    const result = transactionSchema.safeParse({
      type: "EXPENSE",
      amount: 500,
      date: new Date(),
      accountId: "acc-1",
      description: "Groceries",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a zero or negative amount", () => {
    expect(
      transactionSchema.safeParse({
        type: "EXPENSE",
        amount: 0,
        date: new Date(),
        accountId: "acc-1",
        description: "Invalid",
      }).success,
    ).toBe(false);
    expect(
      transactionSchema.safeParse({
        type: "EXPENSE",
        amount: -5,
        date: new Date(),
        accountId: "acc-1",
        description: "Invalid",
      }).success,
    ).toBe(false);
  });

  it("accepts a missing or empty description — the system fills one in from the type", () => {
    expect(
      transactionSchema.safeParse({
        type: "EXPENSE",
        amount: 500,
        date: new Date(),
        accountId: "acc-1",
        description: "",
      }).success,
    ).toBe(true);
    expect(
      transactionSchema.safeParse({
        type: "EXPENSE",
        amount: 500,
        date: new Date(),
        accountId: "acc-1",
      }).success,
    ).toBe(true);
  });
});

describe("transferSchema", () => {
  it("accepts a valid transfer", () => {
    const result = transferSchema.safeParse({
      amount: 500,
      date: new Date(),
      sourceAccountId: "acc-1",
      destinationAccountId: "acc-2",
      description: "Move to savings",
    });
    expect(result.success).toBe(true);
  });

  it("rejects the same account as source and destination", () => {
    const result = transferSchema.safeParse({
      amount: 500,
      date: new Date(),
      sourceAccountId: "acc-1",
      destinationAccountId: "acc-1",
      description: "Invalid",
    });
    expect(result.success).toBe(false);
  });
});
