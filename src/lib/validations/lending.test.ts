import { describe, expect, it } from "vitest";
import { lendingSchema } from "@/lib/validations/lending";

describe("lendingSchema", () => {
  it("accepts a valid CASH lend", () => {
    const result = lendingSchema.safeParse({
      kind: "CASH",
      borrowerName: "Bob",
      amount: 500,
      accountId: "acc-1",
      date: new Date(),
    });
    expect(result.success).toBe(true);
  });

  it("rejects a CASH lend with a zero or negative amount", () => {
    expect(
      lendingSchema.safeParse({
        kind: "CASH",
        borrowerName: "Bob",
        amount: 0,
        accountId: "acc-1",
        date: new Date(),
      }).success,
    ).toBe(false);
  });

  it("rejects a CASH lend missing an account", () => {
    const result = lendingSchema.safeParse({
      kind: "CASH",
      borrowerName: "Bob",
      amount: 500,
      accountId: "",
      date: new Date(),
    });
    expect(result.success).toBe(false);
  });

  it("accepts a valid ITEM lend, with an optional itemValue", () => {
    const result = lendingSchema.safeParse({
      kind: "ITEM",
      borrowerName: "Ana",
      itemDescription: "Blender",
      date: new Date(),
    });
    expect(result.success).toBe(true);
  });

  it("accepts an ITEM lend with an itemValue provided", () => {
    const result = lendingSchema.safeParse({
      kind: "ITEM",
      borrowerName: "Ana",
      itemDescription: "Blender",
      itemValue: 2000,
      date: new Date(),
    });
    expect(result.success).toBe(true);
  });

  it("rejects an ITEM lend missing a description", () => {
    const result = lendingSchema.safeParse({
      kind: "ITEM",
      borrowerName: "Ana",
      itemDescription: "",
      date: new Date(),
    });
    expect(result.success).toBe(false);
  });

  it("rejects a lend with no borrower name", () => {
    const result = lendingSchema.safeParse({
      kind: "CASH",
      borrowerName: "",
      amount: 500,
      accountId: "acc-1",
      date: new Date(),
    });
    expect(result.success).toBe(false);
  });
});
