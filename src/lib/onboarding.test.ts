import { describe, expect, it, vi } from "vitest";
import { completeOnboarding } from "@/lib/onboarding";

function makeFakePrisma() {
  return {
    user: {
      update: vi.fn().mockResolvedValue({}),
    },
  } as any;
}

describe("completeOnboarding", () => {
  it("saves the cycle day, currency, and accent color, and stamps onboardedAt", async () => {
    const prisma = makeFakePrisma();

    await completeOnboarding(prisma, "user-1", {
      cycleStartDay: 25,
      currency: "PHP",
      accentColor: "emerald",
    });

    expect(prisma.user.update).toHaveBeenCalledTimes(1);
    const args = prisma.user.update.mock.calls[0][0];
    expect(args.where).toEqual({ id: "user-1" });
    expect(args.data.cycleStartDay).toBe(25);
    expect(args.data.currency).toBe("PHP");
    expect(args.data.accentColor).toBe("emerald");
    expect(args.data.onboardedAt).toBeInstanceOf(Date);
  });
});
