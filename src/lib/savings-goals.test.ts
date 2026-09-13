import { describe, expect, it, vi } from "vitest";
import { getSavingsGoal, upsertSavingsGoal, computeSavingsProgress } from "@/lib/savings-goals";

function makeFakePrisma(overrides: Record<string, any> = {}) {
  return {
    account: { findFirst: vi.fn().mockResolvedValue({ id: "acc-1", userId: "user-1" }) },
    savingsGoal: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue({ id: "goal-1" }),
    },
    ...overrides,
  } as any;
}

describe("getSavingsGoal", () => {
  it("looks up the goal by accountId, scoped through the account's own userId", async () => {
    const prisma = makeFakePrisma({
      savingsGoal: { findUnique: vi.fn().mockResolvedValue({ id: "goal-1", accountId: "acc-1" }) },
    });
    const result = await getSavingsGoal(prisma, "user-1", "acc-1");
    expect(result).toEqual({ id: "goal-1", accountId: "acc-1" });
  });

  it("returns null when the account doesn't belong to the user", async () => {
    const prisma = makeFakePrisma({ account: { findFirst: vi.fn().mockResolvedValue(null) } });
    const result = await getSavingsGoal(prisma, "user-1", "acc-1");
    expect(result).toBeNull();
  });
});

describe("upsertSavingsGoal", () => {
  it("creates or updates the goal only when the account belongs to the user", async () => {
    const prisma = makeFakePrisma();
    const result = await upsertSavingsGoal(prisma, "user-1", "acc-1", { targetAmount: 500000, assignedAmount: 100000 });

    expect(result).toEqual({ ok: true });
    expect(prisma.savingsGoal.upsert).toHaveBeenCalledWith({
      where: { accountId: "acc-1" },
      create: { userId: "user-1", accountId: "acc-1", targetAmount: 500000, assignedAmount: 100000 },
      update: { targetAmount: 500000, assignedAmount: 100000 },
    });
  });

  it("refuses when the account doesn't belong to the user", async () => {
    const prisma = makeFakePrisma({ account: { findFirst: vi.fn().mockResolvedValue(null) } });
    const result = await upsertSavingsGoal(prisma, "user-1", "acc-1", { targetAmount: null, assignedAmount: 0 });
    expect(result).toEqual({ ok: false, error: "Account not found" });
  });
});

describe("computeSavingsProgress", () => {
  it("computes unassigned, remaining target, and progress percentage", () => {
    const result = computeSavingsProgress({ targetAmount: 500000, assignedAmount: 200000 }, 350000);
    expect(result).toEqual({ unassignedAmount: 150000, remainingTarget: 300000, progressPct: 40 });
  });

  it("returns null remainingTarget/progressPct when there is no target set", () => {
    const result = computeSavingsProgress({ targetAmount: null, assignedAmount: 200000 }, 350000);
    expect(result).toEqual({ unassignedAmount: 150000, remainingTarget: null, progressPct: null });
  });

  it("clamps remainingTarget at zero once the goal is fully assigned", () => {
    const result = computeSavingsProgress({ targetAmount: 100000, assignedAmount: 150000 }, 150000);
    expect(result.remainingTarget).toBe(0);
    expect(result.progressPct).toBe(100);
  });
});
