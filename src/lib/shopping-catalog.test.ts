import { describe, expect, it, vi } from "vitest";
import {
  archiveCatalogItem,
  createCatalogItem,
  getLatestPrice,
  getPriceHistory,
  recordPrice,
  updateCatalogItem,
} from "@/lib/shopping-catalog";

function makeFakePrisma(overrides: Record<string, any> = {}) {
  return {
    shoppingCatalogItem: {
      create: vi.fn(async ({ data }: any) => ({ id: "item-1", ...data })),
      findFirst: vi.fn().mockResolvedValue(null),
      update: vi.fn(async ({ data }: any) => ({ id: "item-1", ...data })),
    },
    alias: {
      create: vi.fn(async ({ data }: any) => ({ id: "alias-1", ...data })),
    },
    shoppingPriceHistory: {
      create: vi.fn(async ({ data }: any) => ({ id: "price-1", ...data })),
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
    },
    ...overrides,
  } as any;
}

describe("createCatalogItem", () => {
  it("creates the item scoped to the user", async () => {
    const prisma = makeFakePrisma();
    const item = await createCatalogItem(prisma, "user-1", {
      canonicalName: "Milk",
      brand: null,
      size: null,
      unit: null,
      categoryId: null,
      defaultQuantity: 1,
      preferredStoreId: null,
      aliases: [],
    });
    expect(item.id).toBe("item-1");
    expect(prisma.shoppingCatalogItem.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: "user-1", canonicalName: "Milk" }),
    });
  });

  it("writes a normalized Alias row (kind: shopping_item) for each alias", async () => {
    const prisma = makeFakePrisma();
    await createCatalogItem(prisma, "user-1", {
      canonicalName: "Milk",
      brand: null,
      size: null,
      unit: null,
      categoryId: null,
      defaultQuantity: 1,
      preferredStoreId: null,
      aliases: ["  Fresh Milk ", "GATAS"],
    });
    expect(prisma.alias.create).toHaveBeenCalledTimes(2);
    expect(prisma.alias.create).toHaveBeenCalledWith({
      data: { userId: "user-1", kind: "shopping_item", alias: "fresh milk", targetId: "item-1" },
    });
    expect(prisma.alias.create).toHaveBeenCalledWith({
      data: { userId: "user-1", kind: "shopping_item", alias: "gatas", targetId: "item-1" },
    });
  });

  it("skips a blank alias", async () => {
    const prisma = makeFakePrisma();
    await createCatalogItem(prisma, "user-1", {
      canonicalName: "Milk",
      brand: null,
      size: null,
      unit: null,
      categoryId: null,
      defaultQuantity: 1,
      preferredStoreId: null,
      aliases: ["   "],
    });
    expect(prisma.alias.create).not.toHaveBeenCalled();
  });
});

describe("updateCatalogItem", () => {
  it("rejects when the item does not belong to the user", async () => {
    const prisma = makeFakePrisma();
    const result = await updateCatalogItem(prisma, "user-1", "item-1", { canonicalName: "Renamed" });
    expect(result.ok).toBe(false);
    expect(prisma.shoppingCatalogItem.update).not.toHaveBeenCalled();
  });

  it("updates the item when it belongs to the user", async () => {
    const prisma = makeFakePrisma({
      shoppingCatalogItem: {
        create: vi.fn(),
        findFirst: vi.fn().mockResolvedValue({ id: "item-1", userId: "user-1" }),
        update: vi.fn(async ({ data }: any) => ({ id: "item-1", ...data })),
      },
    });
    const result = await updateCatalogItem(prisma, "user-1", "item-1", { canonicalName: "Renamed" });
    expect(result.ok).toBe(true);
  });
});

describe("archiveCatalogItem", () => {
  it("sets archivedAt rather than deleting the row", async () => {
    const prisma = makeFakePrisma({
      shoppingCatalogItem: {
        create: vi.fn(),
        findFirst: vi.fn().mockResolvedValue({ id: "item-1", userId: "user-1" }),
        update: vi.fn(async ({ data }: any) => ({ id: "item-1", ...data })),
      },
    });
    const result = await archiveCatalogItem(prisma, "user-1", "item-1");
    expect(result.ok).toBe(true);
    expect(prisma.shoppingCatalogItem.update).toHaveBeenCalledWith({
      where: { id: "item-1" },
      data: { archivedAt: expect.any(Date) },
    });
  });
});

describe("recordPrice", () => {
  it("always inserts, never updates an existing row", async () => {
    const prisma = makeFakePrisma();
    await recordPrice(prisma, "user-1", "item-1", { storeId: "store-1", unitPrice: 5000, source: "MANUAL" });
    expect(prisma.shoppingPriceHistory.create).toHaveBeenCalledWith({
      data: { userId: "user-1", catalogItemId: "item-1", storeId: "store-1", unitPrice: 5000, source: "MANUAL" },
    });
    expect(prisma.shoppingPriceHistory.update).toBeUndefined();
  });

  it("recording a second price never mutates the first row", async () => {
    const rows: any[] = [];
    const prisma = makeFakePrisma({
      shoppingPriceHistory: {
        create: vi.fn(async ({ data }: any) => {
          const row = { id: `price-${rows.length + 1}`, ...data };
          rows.push(row);
          return row;
        }),
        findFirst: vi.fn(),
        findMany: vi.fn(),
      },
    });
    await recordPrice(prisma, "user-1", "item-1", { storeId: null, unitPrice: 5000, source: "MANUAL" });
    const firstRowSnapshot = { ...rows[0] };
    await recordPrice(prisma, "user-1", "item-1", { storeId: null, unitPrice: 6000, source: "MANUAL" });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual(firstRowSnapshot);
    expect(rows[0].unitPrice).toBe(5000);
    expect(rows[1].unitPrice).toBe(6000);
  });
});

describe("getLatestPrice", () => {
  it("returns the same-store price when one exists", async () => {
    const prisma = makeFakePrisma({
      shoppingPriceHistory: {
        create: vi.fn(),
        findFirst: vi.fn().mockResolvedValue({ id: "price-1", storeId: "store-1", unitPrice: 5000 }),
        findMany: vi.fn(),
      },
    });
    const price = await getLatestPrice(prisma, "user-1", "item-1", "store-1");
    expect(price).toEqual({ id: "price-1", storeId: "store-1", unitPrice: 5000 });
  });

  it("falls back to any-store price when no same-store price exists", async () => {
    let call = 0;
    const prisma = makeFakePrisma({
      shoppingPriceHistory: {
        create: vi.fn(),
        findFirst: vi.fn(async () => {
          call++;
          return call === 1 ? null : { id: "price-2", storeId: "other-store", unitPrice: 4000 };
        }),
        findMany: vi.fn(),
      },
    });
    const price = await getLatestPrice(prisma, "user-1", "item-1", "store-1");
    expect(price).toEqual({ id: "price-2", storeId: "other-store", unitPrice: 4000 });
  });

  it("returns null when there are no prices at all", async () => {
    const prisma = makeFakePrisma();
    const price = await getLatestPrice(prisma, "user-1", "item-1");
    expect(price).toBeNull();
  });
});

describe("getPriceHistory", () => {
  it("returns rows ordered most-recent-first", async () => {
    const prisma = makeFakePrisma({
      shoppingPriceHistory: {
        create: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn().mockResolvedValue([{ id: "price-2" }, { id: "price-1" }]),
      },
    });
    const history = await getPriceHistory(prisma, "user-1", "item-1");
    expect(history).toEqual([{ id: "price-2" }, { id: "price-1" }]);
    expect(prisma.shoppingPriceHistory.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1", catalogItemId: "item-1" },
      orderBy: { confirmedAt: "desc" },
    });
  });
});
