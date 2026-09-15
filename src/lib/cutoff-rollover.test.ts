import { describe, expect, it, vi } from "vitest";
import { acknowledgeRollover, shouldPromptRollover } from "@/lib/cutoff-rollover";

describe("shouldPromptRollover", () => {
  it("returns false when the period is already acknowledged, without querying for earlier periods", async () => {
    const count = vi.fn();
    const prisma = { budgetPeriod: { count } } as any;

    const result = await shouldPromptRollover(prisma, "user-1", {
      id: "period-1",
      startDate: new Date(2026, 8, 15),
      rolloverAcknowledgedAt: new Date(2026, 8, 15),
    });

    expect(result).toBe(false);
    expect(count).not.toHaveBeenCalled();
  });

  it("returns false when there is no earlier period (this is the user's very first cutoff)", async () => {
    const count = vi.fn().mockResolvedValue(0);
    const prisma = { budgetPeriod: { count } } as any;

    const result = await shouldPromptRollover(prisma, "user-1", {
      id: "period-1",
      startDate: new Date(2026, 8, 15),
      rolloverAcknowledgedAt: null,
    });

    expect(result).toBe(false);
    expect(count).toHaveBeenCalledWith({
      where: { userId: "user-1", startDate: { lt: new Date(2026, 8, 15) } },
    });
  });

  it("returns true when unacknowledged and an earlier period exists", async () => {
    const count = vi.fn().mockResolvedValue(1);
    const prisma = { budgetPeriod: { count } } as any;

    const result = await shouldPromptRollover(prisma, "user-1", {
      id: "period-1",
      startDate: new Date(2026, 8, 15),
      rolloverAcknowledgedAt: null,
    });

    expect(result).toBe(true);
  });
});

describe("acknowledgeRollover", () => {
  it("records the given amount and an acknowledgment timestamp", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const prisma = { budgetPeriod: { updateMany } } as any;

    const result = await acknowledgeRollover(prisma, "user-1", "period-1", 543200);

    expect(result).toEqual({ ok: true });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "period-1", userId: "user-1" },
      data: { rolloverAcknowledgedAt: expect.any(Date), rolloverAmount: 543200 },
    });
  });

  it("reports not found for a period belonging to another user", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 0 });
    const prisma = { budgetPeriod: { updateMany } } as any;

    const result = await acknowledgeRollover(prisma, "user-1", "period-owned-by-someone-else", 100);

    expect(result).toEqual({ ok: false, error: "Budget period not found" });
  });
});
