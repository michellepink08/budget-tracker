import { describe, expect, it } from "vitest";
import { humanizeEnum } from "@/lib/enum-labels";

describe("humanizeEnum", () => {
  it("converts a single-word enum value to title case", () => {
    expect(humanizeEnum("EXPENSE")).toBe("Expense");
  });

  it("converts a multi-word snake case enum value to title case with spaces", () => {
    expect(humanizeEnum("LOAN_PAYMENT")).toBe("Loan Payment");
    expect(humanizeEnum("CREDIT_CARD_PAYMENT")).toBe("Credit Card Payment");
  });

  it("handles already-lowercase input", () => {
    expect(humanizeEnum("transfer")).toBe("Transfer");
  });
});
