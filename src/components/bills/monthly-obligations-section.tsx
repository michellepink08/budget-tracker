import Link from "next/link";
import { saveCyclePaymentPlanFormAction } from "@/actions/cycle-payment-plan.actions";
import { Card } from "@/components/ui/card";
import { formatMoney } from "@/lib/money";
import type { MonthlyObligationRow } from "@/lib/monthly-obligations";

type Props = { title: string; rows: MonthlyObligationRow[]; periodId: string };

export function MonthlyObligationsSection({ title, rows, periodId }: Props) {
  return (
    <section>
      <h2 className="mb-3 text-sm font-medium text-muted-foreground">{title}</h2>
      {rows.length === 0 ? <p className="text-sm text-muted-foreground">Nothing scheduled for this budget period.</p> : (
        <div className="flex flex-col gap-3">
          {rows.map((item) => {
            const canPlan = item.sourceType === "LOAN" || item.sourceType === "CREDIT_CARD";
            return <Card key={item.id} className="p-4">
              <div className="flex items-start justify-between gap-4"><div><p className="font-medium">{item.name}</p><p className="text-sm text-muted-foreground">Due {item.dueDate ? item.dueDate.toLocaleDateString() : "not set"}</p></div><span className="rounded-full bg-accent-tint px-2 py-1 text-xs">{item.status.toLowerCase()}</span></div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-sm"><span>Expected<br /><strong>{formatMoney(item.expected, item.currency)}</strong></span><span>Paid<br /><strong>{formatMoney(item.actual, item.currency)}</strong></span><span>Remaining<br /><strong>{formatMoney(item.remaining, item.currency)}</strong></span></div>
              {canPlan && <div className="mt-3 flex flex-wrap items-end gap-2"><form action={saveCyclePaymentPlanFormAction} className="flex items-end gap-2"><input type="hidden" name="budgetPeriodId" value={periodId} /><input type="hidden" name="sourceType" value={item.sourceType} /><input type="hidden" name="sourceId" value={item.sourceId} /><input type="hidden" name="dueDate" value={item.dueDate?.toISOString().slice(0, 10) ?? new Date().toISOString().slice(0, 10)} /><label className="text-sm">Planned payment<input className="ml-2 h-8 w-28 rounded border px-2" name="expectedAmount" type="number" step="0.01" min="0" defaultValue={(item.expected / 100).toFixed(2)} /></label><button className="h-8 rounded bg-primary px-3 text-sm text-primary-foreground" type="submit">Save plan</button></form><Link className="text-sm text-primary underline" href="/loans-cards">Record payment</Link></div>}
            </Card>;
          })}
        </div>
      )}
    </section>
  );
}
