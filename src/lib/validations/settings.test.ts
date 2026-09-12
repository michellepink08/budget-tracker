import { describe, expect, it } from "vitest";
import { accentColorSchema, themeModeSchema } from "@/lib/validations/settings";

describe("accentColorSchema", () => {
  it("accepts every known preset", () => {
    for (const value of ["emerald", "teal", "amber", "indigo", "rose", "stone"]) {
      expect(accentColorSchema.safeParse({ accentColor: value }).success).toBe(true);
    }
  });

  it("rejects an unknown accent color", () => {
    const result = accentColorSchema.safeParse({ accentColor: "chartreuse" });
    expect(result.success).toBe(false);
  });
});

describe("themeModeSchema", () => {
  it("accepts light, dark, and system", () => {
    for (const value of ["light", "dark", "system"]) {
      expect(themeModeSchema.safeParse({ themeMode: value }).success).toBe(true);
    }
  });

  it("rejects an unknown theme mode", () => {
    const result = themeModeSchema.safeParse({ themeMode: "midnight" });
    expect(result.success).toBe(false);
  });
});
