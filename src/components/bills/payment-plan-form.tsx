"use client";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { saveCyclePaymentPlanAction } from "@/actions/cycle-payment-plan.actions";

export function PaymentPlanForm({ periodId, sourceType, sourceId, dueDate, expected, compact = false }: { periodId: string; sourceType: "LOAN" | "CREDIT_CARD"; sourceId: string; dueDate: string; expected: number; compact?: boolean }) {
  const router = useRouter();
  return <form action={async (fd) => { const result = await saveCyclePaymentPlanAction(fd); if (!result.ok) { toast.error(result.error); return; } toast.success("Payment plan saved"); router.refresh(); }} className={`flex items-center gap-2 ${compact ? "justify-end" : ""}`}><input type="hidden" name="budgetPeriodId" value={periodId} /><input type="hidden" name="sourceType" value={sourceType} /><input type="hidden" name="sourceId" value={sourceId} /><input type="hidden" name="dueDate" value={dueDate} /><label><span className={compact ? "sr-only" : "text-sm"}>Planned payment</span><input aria-label="Planned payment" className="h-8 w-28 rounded border px-2 text-right tabular-nums" name="expectedAmount" type="number" step="0.01" min="0" defaultValue={(expected/100).toFixed(2)} /></label><button className="h-8 rounded bg-primary px-3 text-sm text-primary-foreground" type="submit">Save</button></form>;
}
