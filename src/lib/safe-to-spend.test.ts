import { describe, expect, it } from "vitest";
import { computeSafeToSpend } from "@/lib/safe-to-spend";

const cutoffEnd = new Date(2026, 8, 30);

describe("computeSafeToSpend", () => {
  it("equals disposable total when there are no payables and nothing remaining", () => {
    const result = computeSafeToSpend({
      disposableTotal: 100000,
      totalRemaining: 0,
      payables: [],
      restrictedAccountIds: new Set(),
      cutoffEnd,
      requiredTransfers: 0,
      confirmedReserves: 0,
    });
    expect(result).toBe(100000);
  });

  it("subtracts a standalone payable due before the cutoff", () => {
    const result = computeSafeToSpend({
      disposableTotal: 100000,
      totalRemaining: 0,
      payables: [{ accountId: "acc-1", amount: 20000, dueDate: new Date(2026, 8, 15) }],
      restrictedAccountIds: new Set(),
      cutoffEnd,
      requiredTransfers: 0,
      confirmedReserves: 0,
    });
    expect(result).toBe(80000);
  });

  it("does not subtract a payable due after the cutoff", () => {
    const result = computeSafeToSpend({
      disposableTotal: 100000,
      totalRemaining: 0,
      payables: [{ accountId: "acc-1", amount: 20000, dueDate: new Date(2026, 9, 5) }],
      restrictedAccountIds: new Set(),
      cutoffEnd,
      requiredTransfers: 0,
      confirmedReserves: 0,
    });
    expect(result).toBe(100000);
  });

  it("excludes a payable tied to a restricted-fund account even if due before the cutoff", () => {
    const result = computeSafeToSpend({
      disposableTotal: 100000,
      totalRemaining: 0,
      payables: [{ accountId: "acc-restricted", amount: 20000, dueDate: new Date(2026, 8, 15) }],
      restrictedAccountIds: new Set(["acc-restricted"]),
      cutoffEnd,
      requiredTransfers: 0,
      confirmedReserves: 0,
    });
    expect(result).toBe(100000);
  });

  it("subtracts totalRemaining", () => {
    const result = computeSafeToSpend({
      disposableTotal: 100000,
      totalRemaining: 30000,
      payables: [],
      restrictedAccountIds: new Set(),
      cutoffEnd,
      requiredTransfers: 0,
      confirmedReserves: 0,
    });
    expect(result).toBe(70000);
  });

  it("can go negative when obligations and remaining budget exceed disposable total", () => {
    const result = computeSafeToSpend({
      disposableTotal: 10000,
      totalRemaining: 5000,
      payables: [{ accountId: "acc-1", amount: 20000, dueDate: new Date(2026, 8, 15) }],
      restrictedAccountIds: new Set(),
      cutoffEnd,
      requiredTransfers: 0,
      confirmedReserves: 0,
    });
    expect(result).toBe(-15000);
  });

  it("subtracts requiredTransfers from the total", () => {
    const result = computeSafeToSpend({
      disposableTotal: 10000,
      totalRemaining: 0,
      payables: [],
      restrictedAccountIds: new Set(),
      cutoffEnd,
      requiredTransfers: 2000,
      confirmedReserves: 0,
    });
    expect(result).toBe(8000);
  });

  it("subtracts confirmedReserves from the total", () => {
    const result = computeSafeToSpend({
      disposableTotal: 10000,
      totalRemaining: 0,
      payables: [],
      restrictedAccountIds: new Set(),
      cutoffEnd,
      requiredTransfers: 0,
      confirmedReserves: 1500,
    });
    expect(result).toBe(8500);
  });

  it("confirmedReserves is a no-op in the realistic case where goals live on SAVINGS accounts (regression guard — do not remove this term as dead code)", () => {
    const result = computeSafeToSpend({
      disposableTotal: 8000,
      totalRemaining: 0,
      payables: [],
      restrictedAccountIds: new Set(),
      cutoffEnd,
      requiredTransfers: 0,
      confirmedReserves: 0,
    });
    expect(result).toBe(8000);
  });
});
