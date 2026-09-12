import { describe, expect, it, vi } from "vitest";
import { createAlias, resolveAlias } from "@/lib/quick-capture/aliases";

function makeFakePrisma(aliasRow: unknown = null) {
  return {
    alias: {
      upsert: vi.fn().mockResolvedValue({}),
      findUnique: vi.fn().mockResolvedValue(aliasRow),
    },
  } as any;
}

describe("createAlias", () => {
  it("upserts a normalized alias row", async () => {
    const prisma = makeFakePrisma();
    await createAlias(prisma, "user-1", { kind: "account", alias: "  BPI  ", targetId: "acc-1" });
    expect(prisma.alias.upsert).toHaveBeenCalledWith({
      where: { userId_kind_alias: { userId: "user-1", kind: "account", alias: "bpi" } },
      update: { targetId: "acc-1" },
      create: { userId: "user-1", kind: "account", alias: "bpi", targetId: "acc-1" },
    });
  });
});

describe("resolveAlias", () => {
  it("resolves via a stored alias row first", async () => {
    const prisma = makeFakePrisma({ targetId: "acc-1" });
    const result = await resolveAlias(prisma, "user-1", "account", "BPI", []);
    expect(result).toEqual({ status: "resolved", id: "acc-1" });
  });

  it("resolves via an exact name match when no alias row exists", async () => {
    const prisma = makeFakePrisma(null);
    const result = await resolveAlias(prisma, "user-1", "account", "GCash", [
      { id: "acc-2", name: "GCash" },
    ]);
    expect(result).toEqual({ status: "resolved", id: "acc-2" });
  });

  it("resolves via a unique partial name match", async () => {
    const prisma = makeFakePrisma(null);
    const result = await resolveAlias(prisma, "user-1", "account", "bpi", [
      { id: "acc-1", name: "BPI Savings" },
      { id: "acc-2", name: "GCash" },
    ]);
    expect(result).toEqual({ status: "resolved", id: "acc-1" });
  });

  it("reports ambiguous when multiple names partially match", async () => {
    const prisma = makeFakePrisma(null);
    const result = await resolveAlias(prisma, "user-1", "account", "bpi", [
      { id: "acc-1", name: "BPI Savings" },
      { id: "acc-2", name: "BPI Checking" },
    ]);
    expect(result).toEqual({ status: "ambiguous", candidateIds: ["acc-1", "acc-2"] });
  });

  it("reports unresolved when nothing matches", async () => {
    const prisma = makeFakePrisma(null);
    const result = await resolveAlias(prisma, "user-1", "category", "spelunking", [
      { id: "cat-1", name: "Food" },
    ]);
    expect(result).toEqual({ status: "unresolved" });
  });
});
