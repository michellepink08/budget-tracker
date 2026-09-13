import { describe, expect, it, vi } from "vitest";
import {
  addIncomeForecast,
  addPhase,
  createYearPlan,
  getActiveYearPlan,
  linkForecastToTransaction,
} from "@/lib/year-plan";

function makeFakePrisma(overrides: Record<string, any> = {}) {
  return {
    yearPlan: {
      create: vi.fn(async ({ data }: any) => ({ id: "plan-1", ...data })),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    yearPlanPhase: {
      create: vi.fn(async ({ data }: any) => ({ id: "phase-1", ...data })),
    },
    incomeForecast: {
      create: vi.fn(async ({ data }: any) => ({ id: "forecast-1", ...data })),
      update: vi.fn(async ({ data }: any) => ({ id: "forecast-1", ...data })),
    },
    transaction: { update: vi.fn(), findMany: vi.fn() },
    account: { update: vi.fn(), findMany: vi.fn() },
    ...overrides,
  } as any;
}

describe("createYearPlan", () => {
  it("creates a plan scoped to the given user", async () => {
    const prisma = makeFakePrisma();
    const plan = await createYearPlan(prisma, "user-1", {
      name: "2026 Onboard Cycle",
      startDate: new Date(2026, 0, 1),
      endDate: new Date(2027, 5, 30),
      minCashBuffer: 2000000,
      vacationReserveGoalId: null,
    });
    expect(plan.id).toBe("plan-1");
    expect(prisma.yearPlan.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: "user-1", name: "2026 Onboard Cycle" }),
    });
  });
});

describe("addPhase", () => {
  it("rejects when the plan does not belong to the user", async () => {
    const prisma = makeFakePrisma({
      yearPlan: { create: vi.fn(), findFirst: vi.fn().mockResolvedValue(null) },
    });
    const result = await addPhase(prisma, "user-1", "plan-1", {
      phaseType: "HOME_SALARY_ONLY",
      startDate: new Date(2026, 5, 1),
      endDate: new Date(2026, 5, 30),
      label: null,
      estimatedExpensesPerCutoff: 4800000,
    });
    expect(result.ok).toBe(false);
  });

  it("creates a phase when the plan belongs to the user", async () => {
    const prisma = makeFakePrisma({
      yearPlan: {
        create: vi.fn(),
        findFirst: vi.fn().mockResolvedValue({ id: "plan-1", userId: "user-1" }),
      },
    });
    const result = await addPhase(prisma, "user-1", "plan-1", {
      phaseType: "HOME_SALARY_ONLY",
      startDate: new Date(2026, 5, 1),
      endDate: new Date(2026, 5, 30),
      label: null,
      estimatedExpensesPerCutoff: 4800000,
    });
    expect(result.ok).toBe(true);
  });
});

describe("addIncomeForecast", () => {
  it("creates a forecast when the plan belongs to the user", async () => {
    const prisma = makeFakePrisma({
      yearPlan: {
        create: vi.fn(),
        findFirst: vi.fn().mockResolvedValue({ id: "plan-1", userId: "user-1" }),
      },
    });
    const result = await addIncomeForecast(prisma, "user-1", "plan-1", {
      phaseId: null,
      source: "MY_SALARY",
      expectedDate: new Date(2026, 0, 15),
      expectedAmount: 3500000,
      cutoffLabel: "Jan 1-15",
      status: "EXPECTED",
      notes: null,
    });
    expect(result.ok).toBe(true);
  });

  it("rejects when the plan does not belong to the user", async () => {
    const prisma = makeFakePrisma();
    const result = await addIncomeForecast(prisma, "user-1", "plan-1", {
      phaseId: null,
      source: "MY_SALARY",
      expectedDate: new Date(2026, 0, 15),
      expectedAmount: 3500000,
      cutoffLabel: "Jan 1-15",
      status: "EXPECTED",
      notes: null,
    });
    expect(result.ok).toBe(false);
  });
});

describe("linkForecastToTransaction", () => {
  it("sets actualTransactionId without touching any Transaction or Account write", async () => {
    const prisma = makeFakePrisma({
      incomeForecast: {
        create: vi.fn(),
        update: vi.fn(async ({ data }: any) => ({ id: "forecast-1", ...data })),
        findFirst: vi.fn().mockResolvedValue({ id: "forecast-1", userId: "user-1" }),
      },
    });
    const result = await linkForecastToTransaction(prisma, "user-1", "forecast-1", "txn-1");
    expect(result.ok).toBe(true);
    expect(prisma.incomeForecast.update).toHaveBeenCalledWith({
      where: { id: "forecast-1" },
      data: { actualTransactionId: "txn-1" },
    });
    expect(prisma.transaction.update).not.toHaveBeenCalled();
    expect(prisma.account.update).not.toHaveBeenCalled();
  });

  it("rejects when the forecast does not belong to the user", async () => {
    const prisma = makeFakePrisma({
      incomeForecast: {
        create: vi.fn(),
        update: vi.fn(),
        findFirst: vi.fn().mockResolvedValue(null),
      },
    });
    const result = await linkForecastToTransaction(prisma, "user-1", "forecast-1", "txn-1");
    expect(result.ok).toBe(false);
    expect(prisma.incomeForecast.update).not.toHaveBeenCalled();
  });
});

describe("getActiveYearPlan", () => {
  it("returns null when the user has no plan yet", async () => {
    const prisma = makeFakePrisma();
    const plan = await getActiveYearPlan(prisma, "user-1");
    expect(plan).toBeNull();
  });

  it("queries for the EXPECTED-scenario plan whose endDate hasn't passed, most recent first", async () => {
    const prisma = makeFakePrisma({
      yearPlan: { create: vi.fn(), findFirst: vi.fn().mockResolvedValue({ id: "plan-1" }) },
    });
    const asOf = new Date(2026, 5, 1);
    const plan = await getActiveYearPlan(prisma, "user-1", asOf);
    expect(plan).toEqual({ id: "plan-1" });
    expect(prisma.yearPlan.findFirst).toHaveBeenCalledWith({
      where: { userId: "user-1", scenario: "EXPECTED", endDate: { gte: asOf } },
      orderBy: { startDate: "desc" },
    });
  });
});
