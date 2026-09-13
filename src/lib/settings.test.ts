import { describe, expect, it, vi } from "vitest";
import { updateThemeMode } from "@/lib/settings";

function makeFakePrisma() {
  return {
    user: {
      update: vi.fn().mockResolvedValue({}),
    },
  } as any;
}

describe("updateThemeMode", () => {
  it("updates the user's stored themeMode", async () => {
    const prisma = makeFakePrisma();

    await updateThemeMode(prisma, "user-1", "dark");

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { themeMode: "dark" },
    });
  });
});
