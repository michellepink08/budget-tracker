import { describe, expect, it } from "vitest";
import { loanSchema } from "@/lib/validations/loan";

describe("loanSchema", () => {
  it("accepts a valid loan", () => {
    const result = loanSchema.safeParse({
      name: "Car loan",
      principal: 500000,
      interestRate: 5.5,
      monthlyPayment: 15000,
      remainingBalance: 300000,
      startDate: new Date(),
    });
    expect(result.success).toBe(true);
  });

  it("rejects a zero or negative principal", () => {
    const result = loanSchema.safeParse({
      name: "Invalid",
      principal: 0,
      interestRate: 5.5,
      monthlyPayment: 15000,
      remainingBalance: 300000,
      startDate: new Date(),
    });
    expect(result.success).toBe(false);
  });

  it("rejects a negative remaining balance", () => {
    const result = loanSchema.safeParse({
      name: "Invalid",
      principal: 500000,
      interestRate: 5.5,
      monthlyPayment: 15000,
      remainingBalance: -1,
      startDate: new Date(),
    });
    expect(result.success).toBe(false);
  });

  it("rejects a negative interest rate", () => {
    const result = loanSchema.safeParse({
      name: "Invalid",
      principal: 500000,
      interestRate: -1,
      monthlyPayment: 15000,
      remainingBalance: 300000,
      startDate: new Date(),
    });
    expect(result.success).toBe(false);
  });

  it("accepts an optional endDate after the start date", () => {
    const result = loanSchema.safeParse({
      name: "Car loan",
      principal: 500000,
      interestRate: 5.5,
      monthlyPayment: 15000,
      remainingBalance: 300000,
      startDate: new Date(2026, 0, 1),
      endDate: new Date(2027, 0, 1),
    });
    expect(result.success).toBe(true);
  });

  it("rejects an endDate on or before the start date", () => {
    const result = loanSchema.safeParse({
      name: "Car loan",
      principal: 500000,
      interestRate: 5.5,
      monthlyPayment: 15000,
      remainingBalance: 300000,
      startDate: new Date(2026, 0, 1),
      endDate: new Date(2026, 0, 1),
    });
    expect(result.success).toBe(false);
  });

  it("accepts an optional dueDay between 1 and 31", () => {
    const result = loanSchema.safeParse({
      name: "Car loan",
      principal: 500000,
      interestRate: 5.5,
      monthlyPayment: 15000,
      remainingBalance: 300000,
      startDate: new Date(),
      dueDay: 15,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a dueDay outside 1-31", () => {
    expect(
      loanSchema.safeParse({
        name: "Car loan",
        principal: 500000,
        interestRate: 5.5,
        monthlyPayment: 15000,
        remainingBalance: 300000,
        startDate: new Date(),
        dueDay: 32,
      }).success,
    ).toBe(false);
    expect(
      loanSchema.safeParse({
        name: "Car loan",
        principal: 500000,
        interestRate: 5.5,
        monthlyPayment: 15000,
        remainingBalance: 300000,
        startDate: new Date(),
        dueDay: 0,
      }).success,
    ).toBe(false);
  });
});
