import { formatMoney } from "@/lib/money";
import type { CalendarEntry } from "@/lib/calendar/aggregate";

// Plan-38 §5: upcoming/pending is amber, not the brand color — brand wine
// is reserved for interactive/primary UI, not a status meaning.
const STATE_DOT: Record<CalendarEntry["state"], string> = {
  PAID: "bg-success",
  OVERDUE: "bg-danger",
  SKIPPED: "bg-muted-foreground",
  UPCOMING: "bg-warning",
};

// Overview only — no per-entry actions here (those live in Agenda/Cutoff
// view); a month grid cell is too small for action buttons, and every
// entry shown here is also reachable from Agenda view.
export function MonthView({ month, entries, currency }: { month: Date; entries: CalendarEntry[]; currency: string }) {
  const year = month.getFullYear();
  const monthIndex0 = month.getMonth();
  const firstOfMonth = new Date(year, monthIndex0, 1);
  const startOffset = firstOfMonth.getDay(); // 0 = Sunday
  const daysInThisMonth = new Date(year, monthIndex0 + 1, 0).getDate();

  const cells: (Date | null)[] = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let day = 1; day <= daysInThisMonth; day++) cells.push(new Date(year, monthIndex0, day));
  while (cells.length % 7 !== 0) cells.push(null);

  const entriesByDay = new Map<number, CalendarEntry[]>();
  for (const entry of entries) {
    if (entry.date.getFullYear() === year && entry.date.getMonth() === monthIndex0) {
      const day = entry.date.getDate();
      const existing = entriesByDay.get(day) ?? [];
      existing.push(entry);
      entriesByDay.set(day, existing);
    }
  }

  return (
    <div className="grid grid-cols-7 gap-1 text-xs">
      {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((label) => (
        <div key={label} className="p-1 text-center font-medium text-muted-foreground">
          {label}
        </div>
      ))}
      {cells.map((date, i) => (
        <div key={i} className="min-h-20 rounded-md border border-border p-1">
          {date && (
            <>
              <p className="text-muted-foreground">{date.getDate()}</p>
              <div className="flex flex-col gap-0.5">
                {(entriesByDay.get(date.getDate()) ?? []).slice(0, 3).map((entry) => (
                  <p key={entry.id} className="flex items-center gap-1 truncate">
                    <span className={`size-1.5 shrink-0 rounded-full ${STATE_DOT[entry.state]}`} />
                    <span className="truncate">
                      {entry.label}
                      {entry.amount !== null ? ` (${formatMoney(entry.amount, currency)})` : ""}
                    </span>
                  </p>
                ))}
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
