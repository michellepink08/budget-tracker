import { describe, expect, it } from "vitest";
import { themeModeSchema } from "@/lib/validations/settings";

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
