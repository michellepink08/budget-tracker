import { describe, expect, it } from "vitest";
import { computeReconciliation } from "@/lib/receipts/reconciliation";

describe("computeReconciliation", () => {
  it("reconciles when line totals plus unitemizedDifference match the expected total", () => {
    const result = computeReconciliation({
      subtotal: 50000,
      discount: 0,
      tax: 6000,
      fees: 0,
      grandTotal: 56000,
      unitemizedDifference: 2000,
      lines: [
        { lineTotal: 30000, excluded: false },
        { lineTotal: 24000, excluded: false },
      ],
    });
    expect(result).toEqual({ reconciled: true, difference: 0 });
  });

  it("reports a mismatch when line totals fall short", () => {
    const result = computeReconciliation({
      subtotal: 50000,
      discount: 0,
      tax: 6000,
      fees: 0,
      grandTotal: 56000,
      unitemizedDifference: 0,
      lines: [{ lineTotal: 54000, excluded: false }],
    });
    expect(result).toEqual({ reconciled: false, difference: 2000 });
  });

  it("excludes lines marked excluded from the line-total sum", () => {
    const result = computeReconciliation({
      subtotal: 50000,
      discount: 0,
      tax: 6000,
      fees: 0,
      grandTotal: 56000,
      unitemizedDifference: 0,
      lines: [
        { lineTotal: 56000, excluded: false },
        { lineTotal: 999999, excluded: true },
      ],
    });
    expect(result).toEqual({ reconciled: true, difference: 0 });
  });

  it("treats null money fields as 0 and reconciles an empty draft", () => {
    const result = computeReconciliation({
      subtotal: null,
      discount: null,
      tax: null,
      fees: null,
      grandTotal: null,
      unitemizedDifference: 0,
      lines: [],
    });
    expect(result).toEqual({ reconciled: true, difference: 0 });
  });

  it("prefers an explicit grandTotal of 0 over the derived subtotal math (a free/returned item)", () => {
    const result = computeReconciliation({
      subtotal: 5000,
      discount: 0,
      tax: 0,
      fees: 0,
      grandTotal: 0,
      unitemizedDifference: 0,
      lines: [],
    });
    // If grandTotal:0 were mistaken for "not set" (e.g. via `||` instead of
    // `??`), this would wrongly fall back to the derived 5000 and report a
    // mismatch. 0 is a legitimate grand total and must be honored exactly.
    expect(result).toEqual({ reconciled: true, difference: 0 });
  });
});
