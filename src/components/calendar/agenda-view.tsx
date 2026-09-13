import { CalendarEntryCard } from "@/components/calendar/calendar-entry-card";
import type { CalendarEntry } from "@/lib/calendar/aggregate";

export function AgendaView({
  entries,
  currency,
  accounts,
}: {
  entries: CalendarEntry[];
  currency: string;
  accounts: { id: string; name: string }[];
}) {
  if (entries.length === 0) {
    return <p className="text-muted-foreground">Nothing in the next 30 days.</p>;
  }

  const groups = new Map<string, CalendarEntry[]>();
  for (const entry of entries) {
    const key = entry.date.toDateString();
    const existing = groups.get(key) ?? [];
    existing.push(entry);
    groups.set(key, existing);
  }

  return (
    <div className="flex flex-col gap-6">
      {[...groups.entries()].map(([dateKey, dayEntries]) => (
        <div key={dateKey}>
          <h3 className="mb-2 text-sm font-medium text-muted-foreground">
            {new Date(dateKey).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
          </h3>
          <div className="flex flex-col gap-2">
            {dayEntries.map((entry) => (
              <CalendarEntryCard key={entry.id} entry={entry} currency={currency} accounts={accounts} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
