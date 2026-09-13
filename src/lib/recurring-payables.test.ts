import { describe, expect, it, vi } from "vitest";
import {
  confirmRecurringPayableOccurrence,
  createRecurringPayable,
  listDueRecurringPayables,
  listRecurringPayables,
  skipRecurringPayableOccurrence,
  updateRecurringPayable,
} from "@/lib/recurring-payables";

const SAMPLE_RULE = {
  id: "rp-1",
  userId: "user-1",
  name: "Internet bill",
  amount: 199900,
  frequency: "MONTHLY",
  intervalDays: null,
  nextDueDate: new Date(2026, 8, 25),
  accountId: "acc-1",
  categoryId: "cat-1",
  active: true,
};

function makeFakePrisma(rule: unknown = SAMPLE_RULE) {
  const prisma = {
    recurringPayable: {
      create: vi.fn().mockResolvedValue({ id: "rp-new" }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      update: vi.fn().mockResolvedValue({}),
      findFirst: vi.fn().mockResolvedValue(rule),
      findMany: vi.fn().mockResolvedValue([]),
    },
    payable: {
      create: vi.fn().mockResolvedValue({ id: "payable-new" }),
    },
    auditLog: {
      create: vi.fn().mockResolvedValue({ id: "audit-1" }),
    },
    $transaction: vi.fn((fn: (tx: unknown) => unknown) => fn(prisma)),
  };
  return prisma as any;
}

describe("createRecurringPayable", () => {
  it("creates a rule scoped to the given user", async () => {
    const prisma = makeFakePrisma();
    const input = {
      name: "Internet bill",
      amount: 199900,
      frequency: "MONTHLY",
      nextDueDate: new Date(2026, 8, 25),
      accountId: "acc-1",
      categoryId: "cat-1",
    };

    await createRecurringPayable(prisma, "user-1", input);

    expect(prisma.recurringPayable.create).toHaveBeenCalledWith({
      data: { userId: "user-1", ...input },
    });
  });
});

describe("updateRecurringPayable", () => {
  it("updates only when the rule belongs to the user", async () => {
    const prisma = makeFakePrisma();

    const result = await updateRecurringPayable(prisma, "user-1", "rp-1", { active: false });

    expect(result).toEqual({ ok: true });
    expect(prisma.recurringPayable.updateMany).toHaveBeenCalledWith({
      where: { id: "rp-1", userId: "user-1" },
      data: { active: false },
    });
  });

  it("reports not found when no row matched", async () => {
    const prisma = makeFakePrisma();
    prisma.recurringPayable.updateMany.mockResolvedValue({ count: 0 });

    const result = await updateRecurringPayable(prisma, "user-1", "rp-1", { active: false });

    expect(result).toEqual({ ok: false, error: "Recurring payable not found" });
  });
});

describe("listRecurringPayables", () => {
  it("scopes to the user and excludes inactive rules by default", async () => {
    const prisma = makeFakePrisma();

    await listRecurringPayables(prisma, "user-1");

    expect(prisma.recurringPayable.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1", active: true },
      orderBy: { nextDueDate: "asc" },
    });
  });
});

describe("listDueRecurringPayables", () => {
  it("scopes to the user, active rules whose nextDueDate has arrived", async () => {
    const prisma = makeFakePrisma();
    const asOf = new Date(2026, 8, 25);

    await listDueRecurringPayables(prisma, "user-1", asOf);

    expect(prisma.recurringPayable.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1", active: true, nextDueDate: { lte: asOf } },
      orderBy: { nextDueDate: "asc" },
    });
  });
});

describe("confirmRecurringPayableOccurrence", () => {
  it("generates a Payable from the rule and advances nextDueDate", async () => {
    const prisma = makeFakePrisma();

    const result = await confirmRecurringPayableOccurrence(prisma, "user-1", "rp-1", {});

    expect(result).toEqual({ ok: true });
    const payableArgs = prisma.payable.create.mock.calls[0][0].data;
    expect(payableArgs.name).toBe("Internet bill");
    expect(payableArgs.amount).toBe(199900);
    expect(payableArgs.accountId).toBe("acc-1");
    expect(payableArgs.recurringPayableId).toBe("rp-1");

    expect(prisma.recurringPayable.update).toHaveBeenCalledWith({
      where: { id: "rp-1" },
      data: { nextDueDate: new Date(2026, 9, 25) },
    });
  });

  it("applies an amount/dueDate override instead of the rule's defaults", async () => {
    const prisma = makeFakePrisma();

    await confirmRecurringPayableOccurrence(prisma, "user-1", "rp-1", {
      amount: 210000,
      dueDate: new Date(2026, 8, 26),
    });

    const payableArgs = prisma.payable.create.mock.calls[0][0].data;
    expect(payableArgs.amount).toBe(210000);
    expect(payableArgs.dueDate).toEqual(new Date(2026, 8, 26));
  });

  it("reports not found for a rule the user doesn't own", async () => {
    const prisma = makeFakePrisma(null);

    const result = await confirmRecurringPayableOccurrence(prisma, "user-1", "rp-1", {});

    expect(result).toEqual({ ok: false, error: "Recurring payable not found" });
    expect(prisma.payable.create).not.toHaveBeenCalled();
  });

  it("records an audit entry capturing the nextDueDate change and the created payable", async () => {
    const prisma = makeFakePrisma();

    await confirmRecurringPayableOccurrence(prisma, "user-1", "rp-1", {});

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-1",
        entityType: "RECURRING_PAYABLE_OCCURRENCE",
        entityId: "rp-1",
        action: "CREATE",
        source: "RECURRING_RULE",
        relatedRecordIds: ["payable-new"],
      }),
    });
  });
});

describe("skipRecurringPayableOccurrence", () => {
  it("advances nextDueDate without generating a payable", async () => {
    const prisma = makeFakePrisma();

    const result = await skipRecurringPayableOccurrence(prisma, "user-1", "rp-1");

    expect(result).toEqual({ ok: true });
    expect(prisma.payable.create).not.toHaveBeenCalled();
    expect(prisma.recurringPayable.update).toHaveBeenCalledWith({
      where: { id: "rp-1" },
      data: { nextDueDate: new Date(2026, 9, 25) },
    });
  });

  it("reports not found for a rule the user doesn't own", async () => {
    const prisma = makeFakePrisma(null);

    const result = await skipRecurringPayableOccurrence(prisma, "user-1", "rp-1");

    expect(result).toEqual({ ok: false, error: "Recurring payable not found" });
  });
});
