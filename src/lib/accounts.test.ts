import { describe, expect, it, vi } from "vitest";
import { archiveAccount, assertOwnedAccount, createAccount, listAccounts, updateAccount } from "@/lib/accounts";

const SAMPLE_INPUT = {
  name: "Everyday Checking",
  accountType: "CHECKING",
  openingBalance: 100000,
  currency: "PHP",
  purpose: "DISPOSABLE" as const,
  isPrimaryFundingAccount: false,
  color: "blue",
  icon: "landmark",
};

describe("createAccount", () => {
  it("creates an account scoped to the given user, deriving includeInLiquidFunds from purpose", async () => {
    const create = vi.fn().mockResolvedValue({ id: "acc-1" });
    const prisma = { account: { create } } as any;

    await createAccount(prisma, "user-1", SAMPLE_INPUT);

    expect(create).toHaveBeenCalledWith({
      data: { userId: "user-1", ...SAMPLE_INPUT, includeInLiquidFunds: true },
    });
  });

  it.each([
    ["DISPOSABLE", true],
    ["SAVINGS", true],
    ["RESTRICTED", false],
    ["CREDIT", false],
    ["DEBT", false],
  ] as const)("derives includeInLiquidFunds=%s -> %s for purpose %s", async (purpose, expected) => {
    const create = vi.fn().mockResolvedValue({ id: "acc-1" });
    const prisma = { account: { create } } as any;

    await createAccount(prisma, "user-1", { ...SAMPLE_INPUT, purpose });

    expect(create.mock.calls[0][0].data.includeInLiquidFunds).toBe(expected);
  });
});

describe("updateAccount", () => {
  it("updates only when the account belongs to the user, deriving includeInLiquidFunds when purpose changes", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const prisma = { account: { updateMany } } as any;

    const result = await updateAccount(prisma, "user-1", "acc-1", { name: "New Name", purpose: "RESTRICTED" });

    expect(result).toEqual({ ok: true });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "acc-1", userId: "user-1" },
      data: { name: "New Name", purpose: "RESTRICTED", includeInLiquidFunds: false },
    });
  });

  it("does not touch includeInLiquidFunds when purpose isn't part of the update", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const prisma = { account: { updateMany } } as any;

    await updateAccount(prisma, "user-1", "acc-1", { name: "New Name" });

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "acc-1", userId: "user-1" },
      data: { name: "New Name" },
    });
  });

  it("reports not found when no row matched (wrong user or missing account)", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 0 });
    const prisma = { account: { updateMany } } as any;

    const result = await updateAccount(prisma, "user-1", "acc-1", { name: "New Name" });

    expect(result).toEqual({ ok: false, error: "Account not found" });
  });
});

describe("archiveAccount", () => {
  it("sets archivedAt only for the owning user's account", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const prisma = { account: { updateMany } } as any;

    const result = await archiveAccount(prisma, "user-1", "acc-1");

    expect(result).toEqual({ ok: true });
    const args = updateMany.mock.calls[0][0];
    expect(args.where).toEqual({ id: "acc-1", userId: "user-1" });
    expect(args.data.archivedAt).toBeInstanceOf(Date);
  });
});

describe("listAccounts", () => {
  it("scopes to the user and excludes archived accounts by default", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = { account: { findMany } } as any;

    await listAccounts(prisma, "user-1");

    expect(findMany).toHaveBeenCalledWith({
      where: { userId: "user-1", archivedAt: null },
      orderBy: { createdAt: "asc" },
    });
  });

  it("includes archived accounts when asked", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = { account: { findMany } } as any;

    await listAccounts(prisma, "user-1", { includeArchived: true });

    expect(findMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      orderBy: { createdAt: "asc" },
    });
  });
});

describe("assertOwnedAccount", () => {
  it("returns the account when it belongs to the user", async () => {
    const findFirst = vi.fn().mockResolvedValue({ id: "acc-1", userId: "user-1", currency: "PHP" });
    const prisma = { account: { findFirst } } as any;

    const result = await assertOwnedAccount(prisma, "user-1", "acc-1");

    expect(result).toEqual({ id: "acc-1", userId: "user-1", currency: "PHP" });
    expect(findFirst).toHaveBeenCalledWith({ where: { id: "acc-1", userId: "user-1" } });
  });

  it("returns null when the account belongs to another user (or doesn't exist)", async () => {
    const prisma = { account: { findFirst: vi.fn().mockResolvedValue(null) } } as any;
    expect(await assertOwnedAccount(prisma, "user-1", "acc-owned-by-someone-else")).toBeNull();
  });
});
