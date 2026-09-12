import { describe, expect, it } from "vitest";
import { expenseLikeDraftSchema, transferDraftSchema } from "@/lib/quick-capture/types";

describe("expenseLikeDraftSchema", () => {
  it("accepts a valid expense draft", () => {
    const result = expenseLikeDraftSchema.safeParse({
      intent: "expense",
      amountMinorUnits: 18000,
      account: { raw: "cash", id: "acc-1", candidateIds: [] },
      category: { raw: "food", id: "cat-1", candidateIds: [] },
      description: "food",
      date: { value: new Date(), confirmed: true },
      cutoffOverride: null,
      clauseText: "Paid 180 for food using cash",
      clarification: null,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a non-positive amount", () => {
    const result = expenseLikeDraftSchema.safeParse({
      intent: "expense",
      amountMinorUnits: 0,
      account: { raw: "cash", id: "acc-1", candidateIds: [] },
      category: null,
      description: "food",
      date: { value: new Date(), confirmed: true },
      cutoffOverride: null,
      clauseText: "x",
      clarification: null,
    });
    expect(result.success).toBe(false);
  });
});

describe("transferDraftSchema", () => {
  it("accepts a valid transfer draft with a zero fee", () => {
    const result = transferDraftSchema.safeParse({
      intent: "transfer",
      amountMinorUnits: 100000,
      feeMinorUnits: 0,
      sourceAccount: { raw: "bpi", id: "acc-1", candidateIds: [] },
      destinationAccount: { raw: "gcash", id: "acc-2", candidateIds: [] },
      description: "Transfer",
      date: { value: new Date(), confirmed: true },
      cutoffOverride: null,
      clauseText: "Transferred 1,000 from BPI to GCash",
      clarification: null,
    });
    expect(result.success).toBe(true);
  });
});
