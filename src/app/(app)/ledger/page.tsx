import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { resolveBudgetPeriodForDate } from "@/lib/budget-period";
import { listLedgerRows } from "@/lib/ledger";
import { listLoans } from "@/lib/loans";
import { listAccounts } from "@/lib/accounts";
import { computeAccountBalance } from "@/lib/account-balance";
import { LedgerWideTable } from "@/components/ledger/ledger-wide-table";
import { LoanSummaryTable } from "@/components/ledger/loan-summary-table";
import { LedgerRangePicker } from "@/components/ledger/ledger-range-picker";
import { LedgerAccountsSummary } from "@/components/ledger/ledger-accounts-summary";
import type { AccountPurpose } from "@/lib/constants/financial";

// "LOANS" isn't an AccountPurpose — it's its own tab backed by the Loan
// model (see LoanSummaryTable), not a ledger of Account transactions.
const LEDGER_TABS = [
  { value: "DISPOSABLE", label: "Disposable" },
  { value: "CREDIT", label: "Credit" },
  { value: "RESTRICTED", label: "Restricted" },
  { value: "SAVINGS", label: "Savings" },
  { value: "LOANS", label: "Debt (Loans)" },
] as const;
type LedgerTab = (typeof LEDGER_TABS)[number]["value"];

export default async function LedgerPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; tab?: string }>;
}) {
  const session = await auth();
  const user = await prisma.user.findUniqueOrThrow({ where: { id: session!.user.id } });
  const params = await searchParams;

  const now = new Date();
  const defaultPeriod = await resolveBudgetPeriodForDate(prisma, user.id, now, user.cycleStartDay);

  const start = params.from ? new Date(params.from) : defaultPeriod.startDate;
  const end = params.to ? new Date(params.to) : defaultPeriod.endDate;

  const activeTab: LedgerTab =
    LEDGER_TABS.find((t) => t.value === params.tab)?.value ?? "DISPOSABLE";

  const rangeQuery = `from=${start.toISOString().slice(0, 10)}&to=${end.toISOString().slice(0, 10)}`;

  const isLoansTab = activeTab === "LOANS";
  const loans = isLoansTab ? await listLoans(prisma, user.id) : [];

  let accountsSummary: { id: string; name: string; accountType: string; balance: number }[] = [];
  let rows: Awaited<ReturnType<typeof listLedgerRows>> = [];
  if (!isLoansTab) {
    const purpose = activeTab as Exclude<LedgerTab, "LOANS"> as AccountPurpose;
    const allAccounts = await listAccounts(prisma, user.id);
    const purposeAccounts = allAccounts.filter((a) => a.purpose === purpose);
    accountsSummary = await Promise.all(
      purposeAccounts.map(async (a) => ({
        id: a.id,
        name: a.name,
        accountType: a.accountType,
        balance: await computeAccountBalance(prisma, a.id),
      })),
    );
    rows = await listLedgerRows(prisma, user.id, purpose, { start, end });
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Ledger</h1>

      <LedgerRangePicker from={start.toISOString().slice(0, 10)} to={end.toISOString().slice(0, 10)} />

      <div className="flex flex-wrap gap-2 border-b border-border pb-2">
        {LEDGER_TABS.map((t) => (
          <Link
            key={t.value}
            href={`/ledger?tab=${t.value}&${rangeQuery}`}
            className={`rounded-md px-3 py-1.5 text-sm ${
              t.value === activeTab ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {isLoansTab ? (
        <LoanSummaryTable loans={loans} />
      ) : (
        <>
          <LedgerAccountsSummary accounts={accountsSummary} currency={user.currency} />
          <LedgerWideTable
            title={LEDGER_TABS.find((t) => t.value === activeTab)!.label}
            rows={rows}
            accounts={accountsSummary}
            currency={user.currency}
          />
        </>
      )}
    </div>
  );
}
