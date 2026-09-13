import { describe, expect, it, vi } from "vitest";
import { EXPORT_KINDS, getExportKind } from "@/lib/export-kinds";

describe("EXPORT_KINDS", () => {
  it("has an entry for every new export kind", () => {
    expect(Object.keys(EXPORT_KINDS).sort()).toEqual(
      [
        "custom-reminders",
        "income-forecasts",
        "price-history",
        "receipts",
        "shopping-catalog",
        "shopping-lists",
        "year-plan",
        "year-plan-phases",
      ].sort(),
    );
  });
});

describe("getExportKind", () => {
  it("returns the registry entry for a known kind", () => {
    expect(getExportKind("year-plan")).toBe(EXPORT_KINDS["year-plan"]);
  });

  it("returns undefined for an unknown kind", () => {
    expect(getExportKind("not-a-real-kind")).toBeUndefined();
  });

  it("every entry's build function is callable with a matching fake prisma (smoke test)", async () => {
    for (const kind of Object.values(EXPORT_KINDS)) {
      const fakePrisma = new Proxy(
        {},
        { get: () => ({ findMany: vi.fn().mockResolvedValue([]) }) },
      );
      const rows = await kind.build(fakePrisma as any, "user-1", "PHP");
      expect(rows).toEqual([]);
    }
  });
});
