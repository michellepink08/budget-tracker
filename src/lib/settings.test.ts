import { describe, expect, it, vi } from "vitest";
import { updateAccentColor, updateThemeMode } from "@/lib/settings";

function makeFakePrisma() {
  return {
    user: {
      update: vi.fn().mockResolvedValue({}),
    },
  } as any;
}

describe("updateAccentColor", () => {
  it("updates the user's stored accentColor", async () => {
    const prisma = makeFakePrisma();

    await updateAccentColor(prisma, "user-1", "blue");

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { accentColor: "blue" },
    });
  });
});

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
