import { describe, expect, it } from "vitest";
import { accountSchema } from "@/lib/validations/account";

describe("accountSchema", () => {
  it("accepts a valid account", () => {
    const result = accountSchema.safeParse({
      name: "Everyday Checking",
      accountType: "CHECKING",
      openingBalance: 1000,
      currency: "PHP",
      includeInLiquidFunds: true,
      isPrimaryFundingAccount: false,
      color: "blue",
      icon: "landmark",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an empty name", () => {
    const result = accountSchema.safeParse({
      name: "",
      accountType: "CHECKING",
      openingBalance: 0,
      currency: "PHP",
      includeInLiquidFunds: true,
      isPrimaryFundingAccount: false,
      color: "blue",
      icon: "landmark",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid accountType", () => {
    const result = accountSchema.safeParse({
      name: "Checking",
      accountType: "NOT_A_TYPE",
      openingBalance: 0,
      currency: "PHP",
      includeInLiquidFunds: true,
      isPrimaryFundingAccount: false,
      color: "blue",
      icon: "landmark",
    });
    expect(result.success).toBe(false);
  });
});
