import { describe, expect, it } from "vitest";
import { mainLinks, isNavLinkActive } from "@/components/nav/nav-links";

describe("main navigation", () => {
  it("uses Monthly Plan as the single planning destination", () => {
    expect(mainLinks.some((link) => link.href === "/bills")).toBe(false);
    expect(mainLinks.find((link) => link.href === "/budget")?.label).toBe("Plan");
  });
  it("keeps planning subpages under Plan", () => { expect(isNavLinkActive("/calendar","/budget")).toBe(true); expect(isNavLinkActive("/year-plan","/budget")).toBe(true); });
  it("keeps lending and reserve subpages under Trackers", () => { expect(isNavLinkActive("/lending","/loans-cards")).toBe(true); expect(isNavLinkActive("/tierra-alta","/loans-cards")).toBe(true); });
});
