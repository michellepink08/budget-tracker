import type { PrismaClient } from "@prisma/client";
import { toMajorUnits } from "@/lib/money";

function formatDateLocal(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export type CustomReminderExportRow = {
  label: string;
  date: string;
  amountMajorUnits: number | null;
  state: string;
  currency: string;
};

export const CUSTOM_REMINDER_EXPORT_COLUMNS: (keyof CustomReminderExportRow)[] = [
  "label",
  "date",
  "amountMajorUnits",
  "state",
  "currency",
];

export async function buildCustomReminderExportRows(
  prisma: Pick<PrismaClient, "customReminder">,
  userId: string,
  currency: string,
): Promise<CustomReminderExportRow[]> {
  const reminders = await prisma.customReminder.findMany({
    where: { userId },
    orderBy: { date: "asc" },
  });

  return (
    reminders as unknown as { label: string; date: Date; amount: number | null; state: string }[]
  ).map((reminder) => ({
    label: reminder.label,
    date: formatDateLocal(reminder.date),
    amountMajorUnits: reminder.amount !== null ? toMajorUnits(reminder.amount, currency) : null,
    state: reminder.state,
    currency,
  }));
}
