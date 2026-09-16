import { describe, expect, it, vi } from "vitest";
import { copyLastCyclePlans } from "@/lib/copy-last-cycle";

describe("copyLastCyclePlans", () => {
  it("copies editable plans without actual links and skips destination duplicates", async () => {
    const prisma: any = {
      budgetPeriod: { findFirst: vi.fn().mockResolvedValueOnce({ id: "dest", userId: "user-1", startDate: new Date(2026, 9, 11) }).mockResolvedValueOnce({ id: "prev" }) },
      cycleIncomePlan: { findMany: vi.fn().mockResolvedValueOnce([{ source: "Salary", expectedAmount: 5000, expectedDate: new Date(2026, 8, 25), notes: null }]).mockResolvedValueOnce([]), createMany: vi.fn().mockResolvedValue({ count: 1 }) },
      budgetAllocation: { findMany: vi.fn().mockResolvedValue([{ categoryId: "cat", subcategoryId: null, plannedAmount: 3000, rolloverMode: "NONE", showDailyAllowance: false }]), findFirst: vi.fn().mockResolvedValue(null), create: vi.fn() },
      cyclePaymentPlan: { findMany: vi.fn().mockResolvedValueOnce([{ sourceType: "LOAN", sourceId: "loan", expectedAmount: 2000, dueDate: new Date(2026, 8, 15) }]).mockResolvedValueOnce([]), upsert: vi.fn() },
    };
    expect(await copyLastCyclePlans(prisma, "user-1", "dest")).toEqual({ ok: true, incomeCopied: 1, allocationsCopied: 1, paymentPlansCopied: 1 });
    expect(prisma.cycleIncomePlan.createMany.mock.calls[0][0].data[0]).not.toHaveProperty("actualTransactionId");
  });
});
