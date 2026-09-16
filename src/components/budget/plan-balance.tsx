import { formatMoney } from "@/lib/money";

export function PlanBalance({ planned, actual, currency, kind }: { planned: number; actual: number; currency: string; kind: "income" | "spending" | "payment" }) {
  const difference = actual - planned;
  const label = difference === 0 ? "on plan" : kind === "income" ? (difference > 0 ? "more received" : "short") : kind === "spending" ? (difference > 0 ? "over budget" : "left") : (difference > 0 ? "paid extra" : "unpaid");
  const warning = (kind === "spending" && difference > 0) || (kind === "income" && difference < 0);
  return <div className={`whitespace-nowrap text-right tabular-nums ${warning ? "text-danger" : ""}`}><p className="font-medium">{formatMoney(Math.abs(difference), currency)}</p><p className="text-xs text-muted-foreground">{label}</p></div>;
}
