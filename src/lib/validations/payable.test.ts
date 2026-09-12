import { describe, expect, it } from "vitest";
import { payableSchema } from "@/lib/validations/payable";

describe("payableSchema", () => {
  it("accepts a valid payable", () => {
    const result = payableSchema.safeParse({
      name: "Electric bill",
      amount: 2500,
      dueDate: new Date(),
      accountId: "acc-1",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a zero or negative amount", () => {
    const result = payableSchema.safeParse({
      name: "Invalid",
      amount: 0,
      dueDate: new Date(),
      accountId: "acc-1",
    });
    expect(result.success).toBe(false);
  });

  it("requires a name", () => {
    const result = payableSchema.safeParse({
      name: "",
      amount: 2500,
      dueDate: new Date(),
      accountId: "acc-1",
    });
    expect(result.success).toBe(false);
  });
});
