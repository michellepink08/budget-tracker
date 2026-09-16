import { describe, expect, it } from "vitest";
import { mainLinks } from "@/components/nav/nav-links";

describe("main navigation", () => {
  it("uses Monthly Plan as the single planning destination", () => {
    expect(mainLinks.some((link) => link.href === "/bills")).toBe(false);
    expect(mainLinks.find((link) => link.href === "/budget")?.label).toBe("Monthly Plan");
  });
});
