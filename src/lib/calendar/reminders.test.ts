import { describe, expect, it, vi } from "vitest";
import { createReminder, deleteReminder, linkTransaction, markPaid, skip } from "@/lib/calendar/reminders";

function makeFakePrisma(overrides: Record<string, any> = {}) {
  return {
    customReminder: {
      create: vi.fn(async ({ data }: any) => ({ id: "reminder-1", ...data })),
      findFirst: vi.fn().mockResolvedValue(null),
      update: vi.fn(async ({ data }: any) => ({ id: "reminder-1", ...data })),
      delete: vi.fn(async () => ({ id: "reminder-1" })),
    },
    transaction: { create: vi.fn(async ({ data }: any) => ({ id: "txn-1", ...data })), findMany: vi.fn() },
    budgetPeriod: {
      findUnique: vi.fn().mockResolvedValue({ id: "period-1" }),
      create: vi.fn().mockResolvedValue({ id: "period-1" }),
    },
    ...overrides,
  } as any;
}

describe("createReminder", () => {
  it("creates a reminder scoped to the user with state UPCOMING", async () => {
    const prisma = makeFakePrisma();
    const reminder = await createReminder(prisma, "user-1", { label: "Passport renewal", date: new Date(2026, 5, 1), amount: null });
    expect(reminder.id).toBe("reminder-1");
    expect(prisma.customReminder.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: "user-1", state: "UPCOMING", label: "Passport renewal" }),
    });
  });
});

describe("markPaid", () => {
  it("rejects when the reminder does not belong to the user", async () => {
    const prisma = makeFakePrisma();
    const result = await markPaid(prisma, "user-1", 1, "reminder-1", { accountId: "acc-1", categoryId: undefined });
    expect(result.ok).toBe(false);
    expect(prisma.transaction.create).not.toHaveBeenCalled();
  });

  it("creates exactly one transaction and links it", async () => {
    const prisma = makeFakePrisma({
      customReminder: {
        create: vi.fn(),
        findFirst: vi.fn().mockResolvedValue({ id: "reminder-1", userId: "user-1", label: "Passport renewal", amount: 500000 }),
        update: vi.fn(async ({ data }: any) => ({ id: "reminder-1", ...data })),
        delete: vi.fn(),
      },
    });
    const result = await markPaid(prisma, "user-1", 1, "reminder-1", { accountId: "acc-1", categoryId: "cat-1" });
    expect(result.ok).toBe(true);
    expect(prisma.transaction.create).toHaveBeenCalledTimes(1);
    expect(prisma.customReminder.update).toHaveBeenCalledWith({
      where: { id: "reminder-1" },
      data: { linkedTransactionId: "txn-1", state: "PAID" },
    });
  });
});

describe("skip", () => {
  it("rejects when the reminder does not belong to the user", async () => {
    const prisma = makeFakePrisma();
    const result = await skip(prisma, "user-1", "reminder-1");
    expect(result.ok).toBe(false);
  });

  it("sets state SKIPPED without creating a transaction", async () => {
    const prisma = makeFakePrisma({
      customReminder: {
        create: vi.fn(),
        findFirst: vi.fn().mockResolvedValue({ id: "reminder-1", userId: "user-1" }),
        update: vi.fn(async ({ data }: any) => ({ id: "reminder-1", ...data })),
        delete: vi.fn(),
      },
    });
    const result = await skip(prisma, "user-1", "reminder-1");
    expect(result.ok).toBe(true);
    expect(prisma.customReminder.update).toHaveBeenCalledWith({ where: { id: "reminder-1" }, data: { state: "SKIPPED" } });
    expect(prisma.transaction.create).not.toHaveBeenCalled();
  });
});

describe("linkTransaction", () => {
  it("rejects when the reminder does not belong to the user", async () => {
    const prisma = makeFakePrisma();
    const result = await linkTransaction(prisma, "user-1", "reminder-1", "txn-existing");
    expect(result.ok).toBe(false);
  });

  it("links an existing transaction without creating a new one", async () => {
    const prisma = makeFakePrisma({
      customReminder: {
        create: vi.fn(),
        findFirst: vi.fn().mockResolvedValue({ id: "reminder-1", userId: "user-1" }),
        update: vi.fn(async ({ data }: any) => ({ id: "reminder-1", ...data })),
        delete: vi.fn(),
      },
    });
    const result = await linkTransaction(prisma, "user-1", "reminder-1", "txn-existing");
    expect(result.ok).toBe(true);
    expect(prisma.customReminder.update).toHaveBeenCalledWith({
      where: { id: "reminder-1" },
      data: { linkedTransactionId: "txn-existing", state: "PAID" },
    });
    expect(prisma.transaction.create).not.toHaveBeenCalled();
  });
});

describe("deleteReminder", () => {
  it("rejects when the reminder does not belong to the user", async () => {
    const prisma = makeFakePrisma();
    const result = await deleteReminder(prisma, "user-1", "reminder-1");
    expect(result.ok).toBe(false);
    expect(prisma.customReminder.delete).not.toHaveBeenCalled();
  });

  it("deletes when owned", async () => {
    const prisma = makeFakePrisma({
      customReminder: {
        create: vi.fn(),
        findFirst: vi.fn().mockResolvedValue({ id: "reminder-1", userId: "user-1" }),
        update: vi.fn(),
        delete: vi.fn(async () => ({ id: "reminder-1" })),
      },
    });
    const result = await deleteReminder(prisma, "user-1", "reminder-1");
    expect(result.ok).toBe(true);
    expect(prisma.customReminder.delete).toHaveBeenCalledWith({ where: { id: "reminder-1" } });
  });
});
