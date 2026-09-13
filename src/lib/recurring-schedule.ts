import type { RecurringFrequency } from "@/lib/constants/financial";

export function daysInMonth(year: number, monthIndex0: number): number {
  return new Date(year, monthIndex0 + 1, 0).getDate();
}

/**
 * Given a recurring rule's current nextDate, returns the date it should
 * advance to after this occurrence is confirmed or skipped. MONTHLY
 * clamps to the last valid day of the target month (e.g. Jan 31 -> Feb 28)
 * — the same rule cycle.ts uses for the custom budget cycle.
 */
export function advanceNextDate(
  currentDate: Date,
  frequency: RecurringFrequency,
  intervalDays?: number,
): Date {
  if (frequency === "WEEKLY") {
    return new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate() + 7);
  }

  if (frequency === "MONTHLY") {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const day = currentDate.getDate();
    const total = month + 1;
    const nextYear = year + Math.floor(total / 12);
    const nextMonth = ((total % 12) + 12) % 12;
    const clampedDay = Math.min(day, daysInMonth(nextYear, nextMonth));
    return new Date(nextYear, nextMonth, clampedDay);
  }

  if (frequency === "CUSTOM") {
    if (!intervalDays || intervalDays < 1) {
      throw new Error("CUSTOM frequency requires a positive intervalDays");
    }
    return new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate() + intervalDays);
  }

  throw new Error(`Unknown frequency: ${frequency}`);
}
