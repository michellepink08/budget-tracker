import { describe, expect, it, vi } from "vitest";
import { resolveRecentTransactionRef } from "@/lib/quick-capture/record-refs";

function makeFakePrisma(transactions: unknown[]) {
  return {
    transaction: {
      findMany: vi.fn().mockResolvedValue(transactions),
    },
  } as any;
}

describe("resolveRecentTransactionRef", () => {
  it("resolves to the single most recent match for a narrowing filter", async () => {
    const prisma = makeFakePrisma([{ id: "txn-2" }, { id: "txn-1" }]);
    const result = await resolveRecentTransactionRef(prisma, "user-1", { categoryId: "cat-transport" });
    expect(result).toEqual({ status: "resolved", id: "txn-2" });
  });

  it("reports unresolved when nothing matches", async () => {
    const prisma = makeFakePrisma([]);
    const result = await resolveRecentTransactionRef(prisma, "user-1", { search: "water" });
    expect(result).toEqual({ status: "unresolved" });
  });

  it("reports ambiguous when the reference has no narrowing filter and more than one recent transaction exists", async () => {
    const prisma = makeFakePrisma([{ id: "txn-3" }, { id: "txn-2" }, { id: "txn-1" }]);
    const result = await resolveRecentTransactionRef(prisma, "user-1", {});
    expect(result).toEqual({ status: "ambiguous", candidateIds: ["txn-3", "txn-2", "txn-1"] });
  });

  it("resolves a single unnarrowed match without asking for clarification", async () => {
    const prisma = makeFakePrisma([{ id: "txn-1" }]);
    const result = await resolveRecentTransactionRef(prisma, "user-1", {});
    expect(result).toEqual({ status: "resolved", id: "txn-1" });
  });
});
