import { AgendaView } from "@/components/calendar/agenda-view";
import type { CalendarEntry } from "@/lib/calendar/aggregate";

export function CutoffView({
  entries,
  currency,
  accounts,
  cutoffLabel,
}: {
  entries: CalendarEntry[];
  currency: string;
  accounts: { id: string; name: string }[];
  cutoffLabel: string;
}) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">Current cutoff: {cutoffLabel}</p>
      <AgendaView
        entries={entries}
        currency={currency}
        accounts={accounts}
        emptyMessage="Nothing scheduled this cutoff."
      />
    </div>
  );
}
