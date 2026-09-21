"use client";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { saveCyclePaymentPlanAction } from "@/actions/cycle-payment-plan.actions";
import type {DueDateStatus} from "@/lib/financial-obligations";

export function PaymentPlanForm({ periodId, sourceType, sourceId, dueDate, dueDateStatus, fundingAccountId, expected, compact = false }: { periodId: string; sourceType: "LOAN" | "CREDIT_CARD"; sourceId: string; dueDate: string; dueDateStatus?:DueDateStatus; fundingAccountId?:string|null; expected: number; compact?: boolean }) {
  const router = useRouter();
  return <form action={async (fd) => { const result = await saveCyclePaymentPlanAction(fd); if (!result.ok) { toast.error(result.error); return; } toast.success("Payment plan saved"); router.refresh(); }} className={`flex flex-wrap items-center gap-2 ${compact ? "justify-end" : ""}`}>
    <input type="hidden" name="budgetPeriodId" value={periodId}/><input type="hidden" name="sourceType" value={sourceType}/><input type="hidden" name="sourceId" value={sourceId}/>
    {fundingAccountId!==undefined&&<input type="hidden" name="fundingAccountId" value={fundingAccountId??""}/>}
    <input aria-label="Payment due date" className="h-8 rounded border px-2" name="dueDate" type="date" defaultValue={dueDate}/>
    <select aria-label="Due date confidence" name="dueDateStatus" className="h-8 rounded border bg-card px-2" defaultValue={dueDateStatus??(dueDate?"ESTIMATED":"UNSET")}><option value="CONFIRMED">Confirmed</option><option value="ESTIMATED">Estimated</option><option value="UNSET">Unconfirmed</option></select>
    <input aria-label="Planned payment" data-plan-key={`payment:${sourceType}:${sourceId}`} data-plan-kind="allocation" data-plan-base={expected} className="h-8 w-28 rounded border px-2 text-right tabular-nums" name="expectedAmount" type="number" step="0.01" min="0" defaultValue={(expected/100).toFixed(2)}/><button className="h-8 rounded bg-primary px-3 text-sm text-primary-foreground" type="submit">Save</button>
  </form>;
}
