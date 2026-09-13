import { describe, expect, it, vi } from "vitest";
import { buildCustomReminderExportRows, CUSTOM_REMINDER_EXPORT_COLUMNS } from "@/lib/export-custom-reminders";

function makeFakePrisma(reminders: unknown[]) {
  return {
    customReminder: { findMany: vi.fn().mockResolvedValue(reminders) },
  } as any;
}

describe("buildCustomReminderExportRows", () => {
  it("maps each reminder into a flat row", async () => {
    const prisma = makeFakePrisma([
      { label: "Passport renewal", date: new Date(2026, 5, 1), amount: 500000, state: "UPCOMING" },
    ]);

    const rows = await buildCustomReminderExportRows(prisma, "user-1", "PHP");

    expect(rows).toEqual([
      {
        label: "Passport renewal",
        date: "2026-06-01",
        amountMajorUnits: 5000,
        state: "UPCOMING",
        currency: "PHP",
      },
    ]);
  });

  it("renders a null amount as null", async () => {
    const prisma = makeFakePrisma([
      { label: "Renew license", date: new Date(2026, 5, 1), amount: null, state: "UPCOMING" },
    ]);

    const rows = await buildCustomReminderExportRows(prisma, "user-1", "PHP");

    expect(rows[0].amountMajorUnits).toBeNull();
  });

  it("scopes to the given user", async () => {
    const prisma = makeFakePrisma([]);

    await buildCustomReminderExportRows(prisma, "user-1", "PHP");

    expect(prisma.customReminder.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      orderBy: { date: "asc" },
    });
  });
});
