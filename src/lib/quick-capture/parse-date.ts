export type DateParseResult = { value: Date; confirmed: boolean };

// "past" resolves a month-day mention to the most recent occurrence that
// isn't in the future (correct for transaction dates — a transaction is
// never dated in the future). "future" resolves to the nearest
// not-yet-passed occurrence (correct for due dates — a payable's due
// date usually hasn't happened yet).
export type DateDirection = "past" | "future";

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function mostRecentPastWeekday(now: Date, targetDow: number): Date {
  const diff = (now.getDay() - targetDow + 7) % 7 || 7;
  return startOfDay(addDays(now, -diff));
}

function resolveMonthDay(now: Date, monthIndex: number, day: number, direction: DateDirection): Date {
  const today = startOfDay(now);
  const candidate = new Date(now.getFullYear(), monthIndex, day);

  if (direction === "past" && candidate > today) {
    candidate.setFullYear(candidate.getFullYear() - 1);
  } else if (direction === "future" && candidate < today) {
    candidate.setFullYear(candidate.getFullYear() + 1);
  }

  return startOfDay(candidate);
}

export function parseRelativeOrExplicitDate(
  text: string,
  now: Date,
  direction: DateDirection = "past",
): DateParseResult {
  const lower = text.toLowerCase();

  if (/\btoday\b/.test(lower)) {
    return { value: startOfDay(now), confirmed: true };
  }
  if (/\byesterday\b/.test(lower)) {
    return { value: startOfDay(addDays(now, -1)), confirmed: true };
  }

  // "last <weekday>" is always a past reference, regardless of direction
  // — none of this app's supported commands phrase a due date that way.
  const weekdayMatch = lower.match(new RegExp(`\\blast\\s+(${WEEKDAYS.join("|")})\\b`));
  if (weekdayMatch) {
    const targetDow = WEEKDAYS.indexOf(weekdayMatch[1]);
    return { value: mostRecentPastWeekday(now, targetDow), confirmed: true };
  }

  const monthDayMatch = lower.match(
    new RegExp(`\\b(?:last\\s+)?(${MONTHS.join("|")})\\s+(\\d{1,2})\\b`),
  );
  if (monthDayMatch) {
    const monthIndex = MONTHS.indexOf(monthDayMatch[1]);
    const day = Number(monthDayMatch[2]);
    const approximate = /\b(around|approximately|roughly|about)\b/.test(lower);
    return {
      value: resolveMonthDay(now, monthIndex, day, direction),
      confirmed: !approximate,
    };
  }

  // No date phrase found at all — assume today, but mark it unconfirmed
  // so the confirmation UI (Phase 2) can visibly flag the assumption.
  return { value: startOfDay(now), confirmed: false };
}
