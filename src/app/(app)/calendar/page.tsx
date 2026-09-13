import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { listCalendarEntries } from "@/lib/calendar/aggregate";
import { resolveBudgetPeriodForDate } from "@/lib/budget-period";
import { listAccounts } from "@/lib/accounts";
import { MonthView } from "@/components/calendar/month-view";
import { CutoffView } from "@/components/calendar/cutoff-view";
import { AgendaView } from "@/components/calendar/agenda-view";
import { ReminderFormDialog } from "@/components/calendar/reminder-form-dialog";

const VIEWS = ["agenda", "cutoff", "month"] as const;
type View = (typeof VIEWS)[number];

const VIEW_LABELS: Record<View, string> = {
  agenda: "Agenda",
  cutoff: "Cutoff",
  month: "Month",
};

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const session = await auth();
  const user = await prisma.user.findUniqueOrThrow({ where: { id: session!.user.id } });

  const params = await searchParams;
  const view: View = VIEWS.includes(params.view as View) ? (params.view as View) : "agenda";

  // Start-of-day, not the exact instant — otherwise a same-day entry
  // (dated at midnight) would fall outside a range starting "now" later in
  // the day, and would be misflagged OVERDUE by a strict `date < now`
  // instant comparison even though its day isn't over yet.
  const nowInstant = new Date();
  const now = new Date(nowInstant.getFullYear(), nowInstant.getMonth(), nowInstant.getDate());
  const accounts = await listAccounts(prisma, user.id);
  const accountOptions = accounts.map((a) => ({ id: a.id, name: a.name }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Calendar</h1>
        <ReminderFormDialog currency={user.currency} />
      </div>

      <div className="flex gap-2 border-b border-border pb-2">
        {VIEWS.map((v) => (
          <Link
            key={v}
            href={`/calendar?view=${v}`}
            className={`rounded-md px-3 py-1.5 text-sm ${
              v === view ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"
            }`}
          >
            {VIEW_LABELS[v]}
          </Link>
        ))}
      </div>

      {view === "agenda" && <AgendaTab userId={user.id} currency={user.currency} accounts={accountOptions} now={now} />}
      {view === "cutoff" && (
        <CutoffTab userId={user.id} currency={user.currency} accounts={accountOptions} cycleStartDay={user.cycleStartDay} now={now} />
      )}
      {view === "month" && <MonthTab userId={user.id} currency={user.currency} now={now} />}
    </div>
  );
}

async function AgendaTab({
  userId,
  currency,
  accounts,
  now,
}: {
  userId: string;
  currency: string;
  accounts: { id: string; name: string }[];
  now: Date;
}) {
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 30);
  const entries = await listCalendarEntries(prisma, userId, { start: now, end }, now);
  return <AgendaView entries={entries} currency={currency} accounts={accounts} />;
}

async function CutoffTab({
  userId,
  currency,
  accounts,
  cycleStartDay,
  now,
}: {
  userId: string;
  currency: string;
  accounts: { id: string; name: string }[];
  cycleStartDay: number;
  now: Date;
}) {
  const period = await resolveBudgetPeriodForDate(prisma, userId, now, cycleStartDay);
  const entries = await listCalendarEntries(prisma, userId, { start: period.startDate, end: period.endDate }, now);
  return <CutoffView entries={entries} currency={currency} accounts={accounts} cutoffLabel={period.name} />;
}

async function MonthTab({ userId, currency, now }: { userId: string; currency: string; now: Date }) {
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const entries = await listCalendarEntries(prisma, userId, { start, end }, now);
  return <MonthView month={start} entries={entries} currency={currency} />;
}
