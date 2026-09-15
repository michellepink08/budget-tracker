import { describe, expect, it, vi } from "vitest";
import {
  archiveLending,
  computeLendingOutstanding,
  createLending,
  listLendings,
  markLendingReturned,
  recordLendingRepayment,
  resolveOrCreateLendingSubcategory,
  updateLending,
} from "@/lib/lending";

function makeFakePrisma() {
  return {
    lending: {
      create: vi.fn().mockResolvedValue({ id: "lending-new" }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findFirst: vi.fn().mockResolvedValue({
        id: "lending-1",
        userId: "user-1",
        borrowerName: "Bob",
        categoryId: "cat-lending",
        subcategoryId: "sub-bob",
      }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    budgetPeriod: {
      findUnique: vi.fn().mockResolvedValue({ id: "period-1" }),
      create: vi.fn(),
    },
    transaction: {
      create: vi.fn().mockResolvedValue({ id: "txn-1" }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    category: {
      findFirst: vi.fn().mockResolvedValue({ id: "cat-lending", name: "Lending" }),
      create: vi.fn().mockResolvedValue({ id: "cat-lending-new", name: "Lending" }),
    },
    subcategory: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: "sub-new" }),
    },
  } as any;
}

describe("createLending", () => {
  it("creates a CASH lending row and its linked outflow transaction", async () => {
    const prisma = makeFakePrisma();

    const result = await createLending(prisma, "user-1", 25, {
      borrowerName: "Bob",
      kind: "CASH",
      amount: 50000,
      accountId: "acc-1",
      date: new Date(2026, 8, 12),
      categoryId: "cat-lending",
      subcategoryId: "sub-bob",
    });

    expect(result.id).toBe("lending-new");
    expect(prisma.lending.create).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        borrowerName: "Bob",
        kind: "CASH",
        amount: 50000,
        accountId: "acc-1",
        date: new Date(2026, 8, 12),
        categoryId: "cat-lending",
        subcategoryId: "sub-bob",
      },
    });
    const txnArgs = prisma.transaction.create.mock.calls[0][0].data;
    expect(txnArgs.type).toBe("LENDING");
    expect(txnArgs.amount).toBe(-50000);
    expect(txnArgs.accountId).toBe("acc-1");
    expect(txnArgs.categoryId).toBe("cat-lending");
    expect(txnArgs.subcategoryId).toBe("sub-bob");
  });

  it("creates an ITEM lending row without any transaction", async () => {
    const prisma = makeFakePrisma();

    await createLending(prisma, "user-1", 25, {
      borrowerName: "Ana",
      kind: "ITEM",
      itemDescription: "Blender",
      date: new Date(2026, 8, 12),
      categoryId: "cat-lending",
      subcategoryId: "sub-ana",
    });

    expect(prisma.transaction.create).not.toHaveBeenCalled();
  });
});

describe("updateLending", () => {
  it("updates only when the lending row belongs to the user", async () => {
    const prisma = makeFakePrisma();

    const result = await updateLending(prisma, "user-1", "lending-1", { borrowerName: "Robert" });

    expect(result).toEqual({ ok: true });
    expect(prisma.lending.updateMany).toHaveBeenCalledWith({
      where: { id: "lending-1", userId: "user-1" },
      data: { borrowerName: "Robert" },
    });
  });

  it("reports not found when no row matched", async () => {
    const prisma = makeFakePrisma();
    prisma.lending.updateMany.mockResolvedValue({ count: 0 });

    const result = await updateLending(prisma, "user-1", "lending-1", { borrowerName: "Robert" });

    expect(result).toEqual({ ok: false, error: "Lending not found" });
  });
});

describe("archiveLending", () => {
  it("sets archivedAt for a lending row belonging to the user", async () => {
    const prisma = makeFakePrisma();

    const result = await archiveLending(prisma, "user-1", "lending-1");

    expect(result).toEqual({ ok: true });
    const args = prisma.lending.updateMany.mock.calls[0][0];
    expect(args.where).toEqual({ id: "lending-1", userId: "user-1" });
    expect(args.data.archivedAt).toBeInstanceOf(Date);
  });
});

describe("listLendings", () => {
  it("scopes to the user and excludes archived rows by default", async () => {
    const prisma = makeFakePrisma();

    await listLendings(prisma, "user-1");

    expect(prisma.lending.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1", archivedAt: null },
      orderBy: { createdAt: "asc" },
    });
  });
});

describe("markLendingReturned", () => {
  it("sets returned: true for a lending row belonging to the user", async () => {
    const prisma = makeFakePrisma();

    const result = await markLendingReturned(prisma, "user-1", "lending-1");

    expect(result).toEqual({ ok: true });
    expect(prisma.lending.updateMany).toHaveBeenCalledWith({
      where: { id: "lending-1", userId: "user-1" },
      data: { returned: true },
    });
  });
});

describe("recordLendingRepayment", () => {
  it("creates an INCOME transaction carrying the lending row's own category/subcategory", async () => {
    const prisma = makeFakePrisma();

    const result = await recordLendingRepayment(prisma, "user-1", 25, "lending-1", {
      accountId: "acc-1",
      amount: 20000,
      date: new Date(2026, 8, 20),
    });

    expect(result).toEqual({ ok: true });
    const txnArgs = prisma.transaction.create.mock.calls[0][0].data;
    expect(txnArgs.type).toBe("INCOME");
    expect(txnArgs.amount).toBe(20000);
    expect(txnArgs.categoryId).toBe("cat-lending");
    expect(txnArgs.subcategoryId).toBe("sub-bob");
  });

  it("reports not found for a lending row the user doesn't own", async () => {
    const prisma = makeFakePrisma();
    prisma.lending.findFirst.mockResolvedValue(null);

    const result = await recordLendingRepayment(prisma, "user-1", 25, "lending-1", {
      accountId: "acc-1",
      amount: 20000,
      date: new Date(2026, 8, 20),
    });

    expect(result).toEqual({ ok: false, error: "Lending not found" });
    expect(prisma.transaction.create).not.toHaveBeenCalled();
  });
});

describe("computeLendingOutstanding", () => {
  it("returns null for an ITEM lend — nothing to derive", async () => {
    const prisma = { transaction: { findMany: vi.fn() } } as any;

    const outstanding = await computeLendingOutstanding(prisma, {
      kind: "ITEM",
      amount: null,
      subcategoryId: "sub-bob",
    });

    expect(outstanding).toBeNull();
    expect(prisma.transaction.findMany).not.toHaveBeenCalled();
  });

  it("subtracts only the positive (repayment) transactions from the original amount", async () => {
    const prisma = {
      transaction: {
        findMany: vi.fn().mockResolvedValue([
          { amount: -50000 }, // the original lending-out transaction itself — must be excluded
          { amount: 20000 }, // a repayment
        ]),
      },
    } as any;

    const outstanding = await computeLendingOutstanding(prisma, {
      kind: "CASH",
      amount: 50000,
      subcategoryId: "sub-bob",
    });

    expect(outstanding).toBe(30000);
    expect(prisma.transaction.findMany).toHaveBeenCalledWith({ where: { subcategoryId: "sub-bob" } });
  });

  it("clamps at zero instead of going negative", async () => {
    const prisma = {
      transaction: { findMany: vi.fn().mockResolvedValue([{ amount: 90000 }]) },
    } as any;

    const outstanding = await computeLendingOutstanding(prisma, {
      kind: "CASH",
      amount: 50000,
      subcategoryId: "sub-bob",
    });

    expect(outstanding).toBe(0);
  });
});

describe("resolveOrCreateLendingSubcategory", () => {
  it("creates the shared 'Lending' category the first time, then a subcategory under it", async () => {
    const prisma = makeFakePrisma();
    prisma.category.findFirst.mockResolvedValue(null);

    const result = await resolveOrCreateLendingSubcategory(prisma, "user-1", "Bob");

    expect(prisma.category.create).toHaveBeenCalledWith({
      data: { userId: "user-1", name: "Lending", type: "INCOME", color: "coral", icon: "tag" },
    });
    expect(prisma.subcategory.create).toHaveBeenCalledWith({
      data: { userId: "user-1", categoryId: "cat-lending-new", name: "Bob" },
    });
    expect(result).toEqual({ categoryId: "cat-lending-new", subcategoryId: "sub-new" });
  });

  it("matches an existing subcategory by name, case-insensitively, instead of creating a duplicate", async () => {
    const prisma = makeFakePrisma();
    prisma.subcategory.findMany.mockResolvedValue([{ id: "sub-existing", name: "bob" }]);

    const result = await resolveOrCreateLendingSubcategory(prisma, "user-1", "Bob");

    expect(prisma.subcategory.create).not.toHaveBeenCalled();
    expect(result).toEqual({ categoryId: "cat-lending", subcategoryId: "sub-existing" });
  });
});
