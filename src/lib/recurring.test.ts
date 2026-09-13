import { describe, expect, it, vi } from "vitest";
import {
  confirmRecurringOccurrence,
  createRecurringRule,
  listDueRecurringRules,
  listRecurringRules,
  skipRecurringOccurrence,
  updateRecurringRule,
} from "@/lib/recurring";

const SAMPLE_RULE = {
  id: "rule-1",
  userId: "user-1",
  name: "Monthly rent",
  transactionType: "EXPENSE",
  amount: 1500000,
  frequency: "MONTHLY",
  intervalDays: null,
  nextDate: new Date(2026, 8, 25),
  accountId: "acc-1",
  categoryId: "cat-1",
  subcategoryId: null,
  active: true,
};

function makeFakePrisma(rule: unknown = SAMPLE_RULE) {
  const prisma = {
    recurringRule: {
      create: vi.fn().mockResolvedValue({ id: "rule-new" }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      update: vi.fn().mockResolvedValue({}),
      findFirst: vi.fn().mockResolvedValue(rule),
      findMany: vi.fn().mockResolvedValue([]),
    },
    budgetPeriod: {
      findUnique: vi.fn().mockResolvedValue({ id: "period-1" }),
      create: vi.fn(),
    },
    transaction: {
      create: vi.fn().mockResolvedValue({ id: "txn-1" }),
    },
    auditLog: {
      create: vi.fn().mockResolvedValue({ id: "audit-1" }),
    },
    $transaction: vi.fn((fn: (tx: unknown) => unknown) => fn(prisma)),
  };
  return prisma as any;
}

describe("createRecurringRule", () => {
  it("creates a rule scoped to the given user", async () => {
    const prisma = makeFakePrisma();
    const input = {
      name: "Monthly rent",
      transactionType: "EXPENSE",
      amount: 1500000,
      frequency: "MONTHLY",
      nextDate: new Date(2026, 8, 25),
      accountId: "acc-1",
      categoryId: "cat-1",
    };

    await createRecurringRule(prisma, "user-1", input);

    expect(prisma.recurringRule.create).toHaveBeenCalledWith({ data: { userId: "user-1", ...input } });
  });
});

describe("updateRecurringRule", () => {
  it("updates only when the rule belongs to the user", async () => {
    const prisma = makeFakePrisma();

    const result = await updateRecurringRule(prisma, "user-1", "rule-1", { active: false });

    expect(result).toEqual({ ok: true });
    expect(prisma.recurringRule.updateMany).toHaveBeenCalledWith({
      where: { id: "rule-1", userId: "user-1" },
      data: { active: false },
    });
  });

  it("reports not found when no row matched", async () => {
    const prisma = makeFakePrisma();
    prisma.recurringRule.updateMany.mockResolvedValue({ count: 0 });

    const result = await updateRecurringRule(prisma, "user-1", "rule-1", { active: false });

    expect(result).toEqual({ ok: false, error: "Recurring rule not found" });
  });
});

describe("listRecurringRules", () => {
  it("scopes to the user and excludes inactive rules by default", async () => {
    const prisma = makeFakePrisma();

    await listRecurringRules(prisma, "user-1");

    expect(prisma.recurringRule.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1", active: true },
      orderBy: { nextDate: "asc" },
    });
  });

  it("includes inactive rules when asked", async () => {
    const prisma = makeFakePrisma();

    await listRecurringRules(prisma, "user-1", { includeInactive: true });

    expect(prisma.recurringRule.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      orderBy: { nextDate: "asc" },
    });
  });
});

describe("listDueRecurringRules", () => {
  it("scopes to the user, active rules whose nextDate has arrived", async () => {
    const prisma = makeFakePrisma();
    const asOf = new Date(2026, 8, 25);

    await listDueRecurringRules(prisma, "user-1", asOf);

    expect(prisma.recurringRule.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1", active: true, nextDate: { lte: asOf } },
      orderBy: { nextDate: "asc" },
    });
  });
});

describe("confirmRecurringOccurrence", () => {
  it("creates a transaction from the rule and advances nextDate", async () => {
    const prisma = makeFakePrisma();

    const result = await confirmRecurringOccurrence(prisma, "user-1", 25, "rule-1", {});

    expect(result).toEqual({ ok: true });
    const txnArgs = prisma.transaction.create.mock.calls[0][0].data;
    expect(txnArgs.type).toBe("EXPENSE");
    expect(txnArgs.amount).toBe(-1500000);
    expect(txnArgs.accountId).toBe("acc-1");
    expect(txnArgs.description).toBe("Monthly rent");

    expect(prisma.recurringRule.update).toHaveBeenCalledWith({
      where: { id: "rule-1" },
      data: { nextDate: new Date(2026, 9, 25) },
    });
  });

  it("applies an amount/date override instead of the rule's defaults", async () => {
    const prisma = makeFakePrisma();

    await confirmRecurringOccurrence(prisma, "user-1", 25, "rule-1", {
      amount: 1600000,
      date: new Date(2026, 8, 26),
    });

    const txnArgs = prisma.transaction.create.mock.calls[0][0].data;
    expect(txnArgs.amount).toBe(-1600000);
    expect(txnArgs.date).toEqual(new Date(2026, 8, 26));
    // nextDate still advances from the rule's own nextDate, not the override date.
    expect(prisma.recurringRule.update).toHaveBeenCalledWith({
      where: { id: "rule-1" },
      data: { nextDate: new Date(2026, 9, 25) },
    });
  });

  it("reports not found for a rule the user doesn't own", async () => {
    const prisma = makeFakePrisma(null);

    const result = await confirmRecurringOccurrence(prisma, "user-1", 25, "rule-1", {});

    expect(result).toEqual({ ok: false, error: "Recurring rule not found" });
    expect(prisma.transaction.create).not.toHaveBeenCalled();
  });

  it("records an audit entry capturing the nextDate change and the created transaction", async () => {
    const prisma = makeFakePrisma();

    await confirmRecurringOccurrence(prisma, "user-1", 25, "rule-1", {});

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-1",
        entityType: "RECURRING_OCCURRENCE",
        entityId: "rule-1",
        action: "CREATE",
        source: "RECURRING_RULE",
        previousValuesJson: JSON.stringify({ nextDate: new Date(2026, 8, 25) }),
        newValuesJson: JSON.stringify({ nextDate: new Date(2026, 9, 25) }),
        relatedRecordIds: ["txn-1"],
      }),
    });
  });
});

describe("skipRecurringOccurrence", () => {
  it("advances nextDate without creating a transaction", async () => {
    const prisma = makeFakePrisma();

    const result = await skipRecurringOccurrence(prisma, "user-1", "rule-1");

    expect(result).toEqual({ ok: true });
    expect(prisma.transaction.create).not.toHaveBeenCalled();
    expect(prisma.recurringRule.update).toHaveBeenCalledWith({
      where: { id: "rule-1" },
      data: { nextDate: new Date(2026, 9, 25) },
    });
  });

  it("reports not found for a rule the user doesn't own", async () => {
    const prisma = makeFakePrisma(null);

    const result = await skipRecurringOccurrence(prisma, "user-1", "rule-1");

    expect(result).toEqual({ ok: false, error: "Recurring rule not found" });
  });
});
