import { describe, expect, it, vi } from "vitest";
import { completeOnboarding, completeOnboardingWithAccount } from "@/lib/onboarding";

function makeFakePrisma(overrides: Record<string, any> = {}) {
  const prisma: any = {
    user: {
      update: vi.fn().mockResolvedValue({}),
    },
    account: {
      create: vi.fn().mockResolvedValue({ id: "acc-1" }),
    },
    ...overrides,
  };
  prisma.$transaction = overrides.$transaction ?? vi.fn((fn: (tx: unknown) => unknown) => fn(prisma));
  return prisma;
}

describe("completeOnboarding", () => {
  it("saves the cycle day and currency, and stamps onboardedAt", async () => {
    const prisma = makeFakePrisma();

    await completeOnboarding(prisma, "user-1", {
      cycleStartDay: 25,
      currency: "PHP",
    });

    expect(prisma.user.update).toHaveBeenCalledTimes(1);
    const args = prisma.user.update.mock.calls[0][0];
    expect(args.where).toEqual({ id: "user-1" });
    expect(args.data.cycleStartDay).toBe(25);
    expect(args.data.currency).toBe("PHP");
    expect(args.data.onboardedAt).toBeInstanceOf(Date);
  });
});

describe("completeOnboardingWithAccount", () => {
  it("updates the user and creates the account inside one transaction", async () => {
    const prisma = makeFakePrisma();

    await completeOnboardingWithAccount(
      prisma,
      "user-1",
      { cycleStartDay: 25, currency: "PHP" },
      { name: "Everyday Checking", accountType: "CHECKING", openingBalance: 500000 },
    );

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: expect.objectContaining({ cycleStartDay: 25, currency: "PHP", onboardedAt: expect.any(Date) }),
    });
    expect(prisma.account.create).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        name: "Everyday Checking",
        accountType: "CHECKING",
        openingBalance: 500000,
        currency: "PHP",
        purpose: "DISPOSABLE",
        isPrimaryFundingAccount: true,
        color: "blue",
        icon: "landmark",
        includeInLiquidFunds: true,
      },
    });
  });
});
