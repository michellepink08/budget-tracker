// Computes which custom budget cycle a given date falls into, based on
// the user's cycleStartDay (1-31). This is the one place this math
// happens — every page/report/service that needs "what cycle is this
// date in" calls into here instead of re-deriving it.

export type CycleRange = { start: Date; end: Date };

function daysInMonth(year: number, monthIndex0: number): number {
  return new Date(Date.UTC(year, monthIndex0 + 1, 0)).getUTCDate();
}

function effectiveStartDay(year: number, monthIndex0: number, cycleStartDay: number): number {
  return Math.min(cycleStartDay, daysInMonth(year, monthIndex0));
}

function monthCandidateStart(year: number, monthIndex0: number, cycleStartDay: number): Date {
  return new Date(Date.UTC(year, monthIndex0, effectiveStartDay(year, monthIndex0, cycleStartDay)));
}

function shiftMonth(
  year: number,
  monthIndex0: number,
  delta: number,
): { year: number; monthIndex0: number } {
  const total = monthIndex0 + delta;
  return {
    year: year + Math.floor(total / 12),
    monthIndex0: ((total % 12) + 12) % 12,
  };
}

function subtractOneDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - 1));
}

export function getCycleForDate(cycleStartDay: number, date: Date): CycleRange {
  if (!Number.isInteger(cycleStartDay) || cycleStartDay < 1 || cycleStartDay > 31) {
    throw new Error(`cycleStartDay must be an integer between 1 and 31, got ${cycleStartDay}`);
  }

  // Calendar days follow Manila; stored boundaries are UTC date stamps,
  // independent of the machine running the app.
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila", year: "numeric", month: "numeric", day: "numeric",
  }).formatToParts(date);
  const part = (type: string) => Number(parts.find((entry) => entry.type === type)?.value);
  const year = part("year");
  const monthIndex0 = part("month") - 1;
  const normalized = new Date(Date.UTC(year, monthIndex0, part("day")));

  const thisMonthStart = monthCandidateStart(year, monthIndex0, cycleStartDay);

  if (normalized.getTime() >= thisMonthStart.getTime()) {
    const next = shiftMonth(year, monthIndex0, 1);
    const nextMonthStart = monthCandidateStart(next.year, next.monthIndex0, cycleStartDay);
    return { start: thisMonthStart, end: subtractOneDay(nextMonthStart) };
  }

  const prev = shiftMonth(year, monthIndex0, -1);
  const prevMonthStart = monthCandidateStart(prev.year, prev.monthIndex0, cycleStartDay);
  return { start: prevMonthStart, end: subtractOneDay(thisMonthStart) };
}

export function getCurrentCycle(cycleStartDay: number, now: Date = new Date()): CycleRange {
  return getCycleForDate(cycleStartDay, now);
}

const MONTH_ABBR = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export function formatCycleRange(range: CycleRange): string {
  const { start, end } = range;
  const startLabel = `${MONTH_ABBR[start.getUTCMonth()]} ${start.getUTCDate()}`;
  const endLabel = `${MONTH_ABBR[end.getUTCMonth()]} ${end.getUTCDate()}`;

  if (start.getUTCFullYear() === end.getUTCFullYear()) {
    return `${startLabel} – ${endLabel}, ${end.getUTCFullYear()}`;
  }
  return `${startLabel}, ${start.getUTCFullYear()} – ${endLabel}, ${end.getUTCFullYear()}`;
}
