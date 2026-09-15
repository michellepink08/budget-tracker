const calendarViews = ["agenda", "cutoff", "month"] as const;

export type CalendarView = (typeof calendarViews)[number];

export function resolveCalendarView(view: string | undefined): CalendarView {
  return calendarViews.includes(view as CalendarView) ? (view as CalendarView) : "month";
}
