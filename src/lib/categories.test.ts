import { describe, expect, it, vi } from "vitest";
import {
  archiveCategory,
  archiveSubcategory,
  assertOwnedCategory,
  assertOwnedSubcategory,
  createCategory,
  createSubcategory,
  listCategories,
  resolveOrCreateCategory,
  updateCategory,
} from "@/lib/categories";

describe("createCategory", () => {
  it("creates a category scoped to the given user", async () => {
    const create = vi.fn().mockResolvedValue({ id: "cat-1" });
    const prisma = { category: { create } } as any;

    const input = { name: "Groceries", type: "EXPENSE", color: "coral", icon: "shopping-cart" };
    await createCategory(prisma, "user-1", input);

    expect(create).toHaveBeenCalledWith({ data: { userId: "user-1", ...input } });
  });
});

describe("updateCategory", () => {
  it("updates only when the category belongs to the user", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const prisma = { category: { updateMany } } as any;

    const result = await updateCategory(prisma, "user-1", "cat-1", { name: "New Name" });

    expect(result).toEqual({ ok: true });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "cat-1", userId: "user-1" },
      data: { name: "New Name" },
    });
  });
});

describe("archiveCategory", () => {
  it("reports not found for a category the user doesn't own", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 0 });
    const prisma = { category: { updateMany } } as any;

    const result = await archiveCategory(prisma, "user-1", "cat-1");

    expect(result).toEqual({ ok: false, error: "Category not found" });
  });
});

describe("listCategories", () => {
  it("scopes to the user, excludes archived by default, and includes subcategories", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = { category: { findMany } } as any;

    await listCategories(prisma, "user-1");

    expect(findMany).toHaveBeenCalledWith({
      where: { userId: "user-1", archivedAt: null },
      include: { subcategories: { where: { archivedAt: null } } },
      orderBy: { sortOrder: "asc" },
    });
  });
});

describe("createSubcategory", () => {
  it("creates a subcategory scoped to the given user", async () => {
    const create = vi.fn().mockResolvedValue({ id: "sub-1" });
    const prisma = {
      subcategory: { create },
      category: { findFirst: vi.fn().mockResolvedValue({ id: "cat-1" }) },
    } as any;

    const result = await createSubcategory(prisma, "user-1", { name: "Produce", categoryId: "cat-1" });

    expect(result).toEqual({ ok: true, id: "sub-1" });
    expect(create).toHaveBeenCalledWith({
      data: { userId: "user-1", name: "Produce", categoryId: "cat-1" },
    });
  });

  it("reports not found when the parent category belongs to another user", async () => {
    const create = vi.fn();
    const prisma = {
      subcategory: { create },
      category: { findFirst: vi.fn().mockResolvedValue(null) },
    } as any;

    const result = await createSubcategory(prisma, "user-1", { name: "Produce", categoryId: "cat-1" });

    expect(result).toEqual({ ok: false, error: "Category not found" });
    expect(create).not.toHaveBeenCalled();
  });
});

describe("archiveSubcategory", () => {
  it("reports not found for a subcategory the user doesn't own", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 0 });
    const prisma = { subcategory: { updateMany } } as any;

    const result = await archiveSubcategory(prisma, "user-1", "sub-1");

    expect(result).toEqual({ ok: false, error: "Subcategory not found" });
  });
});

describe("assertOwnedCategory", () => {
  it("returns true when the category belongs to the user", async () => {
    const prisma = { category: { findFirst: vi.fn().mockResolvedValue({ id: "cat-1" }) } } as any;
    expect(await assertOwnedCategory(prisma, "user-1", "cat-1")).toBe(true);
  });

  it("returns false when the category belongs to another user", async () => {
    const prisma = { category: { findFirst: vi.fn().mockResolvedValue(null) } } as any;
    expect(await assertOwnedCategory(prisma, "user-1", "cat-owned-by-someone-else")).toBe(false);
  });
});

describe("resolveOrCreateCategory", () => {
  it("resolves to an existing category by exact name match, without creating anything", async () => {
    const create = vi.fn();
    const prisma = {
      category: {
        findMany: vi.fn().mockResolvedValue([{ id: "cat-groceries", name: "Groceries" }]),
        create,
      },
      alias: { findUnique: vi.fn().mockResolvedValue(null) },
    } as any;

    const result = await resolveOrCreateCategory(prisma, "user-1", "groceries", "EXPENSE");

    expect(result).toEqual({ ok: true, id: "cat-groceries" });
    expect(create).not.toHaveBeenCalled();
  });

  it("resolves via a previously-taught alias even when the name doesn't match", async () => {
    const create = vi.fn();
    const prisma = {
      category: {
        findMany: vi.fn().mockResolvedValue([{ id: "cat-dining", name: "Dining Out" }]),
        create,
      },
      alias: {
        findUnique: vi.fn().mockResolvedValue({ targetId: "cat-dining" }),
      },
    } as any;

    const result = await resolveOrCreateCategory(prisma, "user-1", "jollibee", "EXPENSE");

    expect(result).toEqual({ ok: true, id: "cat-dining" });
    expect(create).not.toHaveBeenCalled();
  });

  it("creates a new category, typed to match the transaction type, when nothing resolves", async () => {
    const prisma = {
      category: {
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockResolvedValue({ id: "cat-new" }),
      },
      alias: { findUnique: vi.fn().mockResolvedValue(null) },
    } as any;

    const result = await resolveOrCreateCategory(prisma, "user-1", "Jollibee", "LOAN_PAYMENT");

    expect(result).toEqual({ ok: true, id: "cat-new" });
    expect(prisma.category.create).toHaveBeenCalledWith({
      data: { userId: "user-1", name: "Jollibee", type: "DEBT_PAYMENT", color: "coral", icon: "tag" },
    });
  });

  it("maps every non-transfer transaction type to a sensible category type", async () => {
    const makePrisma = () =>
      ({
        category: { findMany: vi.fn().mockResolvedValue([]), create: vi.fn().mockResolvedValue({ id: "cat-new" }) },
        alias: { findUnique: vi.fn().mockResolvedValue(null) },
      }) as any;

    const cases: Record<string, string> = {
      EXPENSE: "EXPENSE",
      INCOME: "INCOME",
      REFUND: "EXPENSE",
      SAVINGS: "SAVINGS",
      LOAN_PAYMENT: "DEBT_PAYMENT",
      CREDIT_CARD_PAYMENT: "DEBT_PAYMENT",
      TRANSFER_FEE: "EXPENSE",
    };

    for (const [transactionType, expectedCategoryType] of Object.entries(cases)) {
      const prisma = makePrisma();
      await resolveOrCreateCategory(prisma, "user-1", "New One", transactionType);
      expect(prisma.category.create).toHaveBeenCalledWith({
        data: { userId: "user-1", name: "New One", type: expectedCategoryType, color: "coral", icon: "tag" },
      });
    }
  });

  it("reports an error instead of guessing when the word matches more than one category", async () => {
    const create = vi.fn();
    const prisma = {
      category: {
        findMany: vi.fn().mockResolvedValue([
          { id: "cat-1", name: "Transport" },
          { id: "cat-2", name: "Transfer Fee" },
        ]),
        create,
      },
      alias: { findUnique: vi.fn().mockResolvedValue(null) },
    } as any;

    // Neither category's name equals "trans" exactly, but both contain it —
    // triggering resolveAlias's partial-match ambiguity, not an exact hit.
    const result = await resolveOrCreateCategory(prisma, "user-1", "trans", "EXPENSE");

    expect(result.ok).toBe(false);
    expect(create).not.toHaveBeenCalled();
  });
});

describe("assertOwnedSubcategory", () => {
  it("returns true when the subcategory belongs to the user", async () => {
    const prisma = { subcategory: { findFirst: vi.fn().mockResolvedValue({ id: "sub-1" }) } } as any;
    expect(await assertOwnedSubcategory(prisma, "user-1", "sub-1")).toBe(true);
  });

  it("returns false when the subcategory belongs to another user", async () => {
    const prisma = { subcategory: { findFirst: vi.fn().mockResolvedValue(null) } } as any;
    expect(await assertOwnedSubcategory(prisma, "user-1", "sub-owned-by-someone-else")).toBe(false);
  });
});
