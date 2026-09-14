import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { resolveBudgetPeriodForDate } from "@/lib/budget-period";
import { listLedgerRows } from "@/lib/ledger";
import { listLoans } from "@/lib/loans";
import { LedgerTable } from "@/components/ledger/ledger-table";
import { LoanSummaryTable } from "@/components/ledger/loan-summary-table";
import { LedgerRangePicker } from "@/components/ledger/ledger-range-picker";

export default async function LedgerPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const session = await auth();
  const user = await prisma.user.findUniqueOrThrow({ where: { id: session!.user.id } });
  const params = await searchParams;

  const now = new Date();
  const defaultPeriod = await resolveBudgetPeriodForDate(prisma, user.id, now, user.cycleStartDay);

  const start = params.from ? new Date(params.from) : defaultPeriod.startDate;
  const end = params.to ? new Date(params.to) : defaultPeriod.endDate;

  const [disposable, credit, restricted, savings, loans] = await Promise.all([
    listLedgerRows(prisma, user.id, "DISPOSABLE", { start, end }),
    listLedgerRows(prisma, user.id, "CREDIT", { start, end }),
    listLedgerRows(prisma, user.id, "RESTRICTED", { start, end }),
    listLedgerRows(prisma, user.id, "SAVINGS", { start, end }),
    listLoans(prisma, user.id),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Ledger</h1>

      <LedgerRangePicker from={start.toISOString().slice(0, 10)} to={end.toISOString().slice(0, 10)} />

      <LedgerTable title="Disposable" rows={disposable} currency={user.currency} />
      <LedgerTable title="Credit" rows={credit} currency={user.currency} />
      <LedgerTable title="Restricted" rows={restricted} currency={user.currency} />
      <LedgerTable title="Savings" rows={savings} currency={user.currency} />
      <LoanSummaryTable loans={loans} />
    </div>
  );
}
