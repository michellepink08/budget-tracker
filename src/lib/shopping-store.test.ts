import { describe, expect, it, vi } from "vitest";
import { getOrCreateStore } from "@/lib/shopping-store";

describe("getOrCreateStore", () => {
  it("returns null when no name is given", async () => {
    const prisma = { shoppingStore: { findFirst: vi.fn(), create: vi.fn() } } as any;
    const storeId = await getOrCreateStore(prisma, "user-1", null);
    expect(storeId).toBeNull();
    expect(prisma.shoppingStore.findFirst).not.toHaveBeenCalled();
  });

  it("returns the existing store's id when one matches by name (case-insensitive)", async () => {
    const prisma = {
      shoppingStore: {
        findFirst: vi.fn().mockResolvedValue({ id: "store-1", name: "SM Supermarket" }),
        create: vi.fn(),
      },
    } as any;
    const storeId = await getOrCreateStore(prisma, "user-1", "sm supermarket");
    expect(storeId).toBe("store-1");
    expect(prisma.shoppingStore.create).not.toHaveBeenCalled();
  });

  it("creates a new store when no match exists", async () => {
    const prisma = {
      shoppingStore: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: "store-2", name: "Landers" }),
      },
    } as any;
    const storeId = await getOrCreateStore(prisma, "user-1", "Landers");
    expect(storeId).toBe("store-2");
    expect(prisma.shoppingStore.create).toHaveBeenCalledWith({ data: { userId: "user-1", name: "Landers" } });
  });
});
