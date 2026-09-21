import { describe, expect, it } from "vitest";
import { buildAccountActivity, lendingStatus } from "./workspace-ledger";

const accounts = [{ id: "cash", name: "Cash", accountType: "CASH" }, { id: "bank", name: "Bank", accountType: "SAVINGS" }, { id: "card", name: "Card", accountType: "CREDIT_CARD" }];
const row = (id: string, accountId: string, amount: number, linkedTransactionId: string | null = null, type = "TRANSFER") => ({ id, accountId, amount, linkedTransactionId, type, date: new Date("2026-09-12"), description: "Payment", status: "CLEARED" });
describe("account activity presentation", () => {
  it("shows linked transfers once, with both cash movements", () => {
    const result = buildAccountActivity([row("a", "cash", -50000, "b"), row("b", "bank", 50000, "a")], accounts);
    expect(result).toHaveLength(1); expect(result[0].amounts).toEqual({ cash: -50000, bank: 50000 });
  });
  it("inverts credit availability movements into liability movements", () => {
    expect(buildAccountActivity([row("a", "card", -35879, null, "EXPENSE")], accounts)[0].amounts.card).toBe(35879);
  });
  it("keeps a card payment as one row, reducing cash and debt", () => {
    const result = buildAccountActivity([row("a", "cash", -749404, "b", "CREDIT_CARD_PAYMENT"), row("b", "card", 749404, "a", "CREDIT_CARD_PAYMENT")], accounts);
    expect(result).toHaveLength(1); expect(result[0].amounts).toEqual({ cash: -749404, card: -749404 });
  });
  it("preserves standalone or missing-partner records instead of inventing money", () => {
    expect(buildAccountActivity([row("a", "cash", -50000, "missing")], accounts)[0].amounts).toEqual({ cash: -50000 });
  });
  it("labels receivable receipts separately from income", () => {
    expect(buildAccountActivity([row("a", "bank", 150000, null, "RECEIVABLE_REPAYMENT")], accounts)[0].label).toBe("Repayment received");
    expect(buildAccountActivity([row("b", "cash", -50000, null, "LENDING")], accounts)[0].label).toBe("Lent out");
  });
  it.each([[150000,150000,"Unpaid"],[150000,50000,"Partially repaid"],[150000,0,"Fully repaid"]])("derives lending state from original and remaining amounts", (original,remaining,label) => {
    expect(lendingStatus(original as number,remaining as number)).toBe(label);
  });
});
