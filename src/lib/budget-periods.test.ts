import { describe, expect, it, vi } from "vitest";
import { createBudgetPeriod, listBudgetPeriods } from "@/lib/budget-periods";

describe("listBudgetPeriods", () => {
  it("scopes to the user, newest first", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = { budgetPeriod: { findMany } } as any;

    await listBudgetPeriods(prisma, "user-1");

    expect(findMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      orderBy: { startDate: "desc" },
    });
  });
});

describe("createBudgetPeriod", () => {
  it("creates a period scoped to the given user", async () => {
    const create = vi.fn().mockResolvedValue({ id: "period-new" });
    const prisma = { budgetPeriod: { create } } as any;

    await createBudgetPeriod(prisma, "user-1", {
      name: "October cycle",
      startDate: new Date(2026, 9, 25),
      endDate: new Date(2026, 10, 24),
      status: "UPCOMING",
    });

    expect(create).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        name: "October cycle",
        startDate: new Date(2026, 9, 25),
        endDate: new Date(2026, 10, 24),
        status: "UPCOMING",
      },
    });
  });
});
