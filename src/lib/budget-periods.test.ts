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
    const findUnique = vi.fn().mockResolvedValue(null);
    const create = vi.fn().mockResolvedValue({ id: "period-new" });
    const prisma = { budgetPeriod: { findUnique, create } } as any;

    const result = await createBudgetPeriod(prisma, "user-1", {
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
    expect(result).toEqual({ ok: true, id: "period-new" });
  });

  it("rejects with a friendly error instead of crashing when a period already starts on that date", async () => {
    const findUnique = vi.fn().mockResolvedValue({ id: "period-existing" });
    const create = vi.fn();
    const prisma = { budgetPeriod: { findUnique, create } } as any;

    const result = await createBudgetPeriod(prisma, "user-1", {
      name: "October cycle",
      startDate: new Date(2026, 9, 25),
      endDate: new Date(2026, 10, 24),
      status: "UPCOMING",
    });

    expect(create).not.toHaveBeenCalled();
    expect(result).toEqual({
      ok: false,
      error: "A period already starts on that date",
    });
  });
});
