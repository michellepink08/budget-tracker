export type DueDateStatus = "CONFIRMED" | "ESTIMATED" | "UNSET";
export function validateDueDate(date: Date | null, status: DueDateStatus): boolean {
  return status === "UNSET" ? date === null : date instanceof Date && Number.isFinite(date.getTime());
}

function manilaDay(date: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}
export function classifyObligation(item: { dueDate: Date | null; dueDateStatus: DueDateStatus; remaining: number }, today: Date) {
  if (item.remaining <= 0) return "PAID";
  if (item.dueDateStatus === "UNSET" || !item.dueDate) return "UNSCHEDULED";
  const due = manilaDay(item.dueDate), day = manilaDay(today);
  if (due < day) return item.dueDateStatus === "CONFIRMED" ? "OVERDUE" : "NEEDS_CONFIRMATION";
  const horizon = manilaDay(new Date(today.getTime() + 7 * 86400000));
  return due <= horizon ? "UPCOMING" : "LATER";
}

// The remainder of total liability is not automatically unbilled: it may
// include older unpaid statements. Only expose a separately verified value.
export function cardStatementSummary(totalLiability: number, statementAmount: number | null, paid: number, verifiedUnbilled: number | null = null) {
  const statementRemaining = statementAmount === null ? null : Math.max(0, statementAmount - paid);
  return { statementAmount, statementRemaining, unbilled: verifiedUnbilled === null ? null : Math.max(0, totalLiability - (statementRemaining ?? 0)) };
}

export function linkedPlanActual(plan:{sourceType:string;sourceId:string;payments:{amount:number;transaction?:{type:string;amount:number;loanId:string|null;creditCardId:string|null}}[]}){
  return plan.payments.reduce((sum,link)=>{
    const t=link.transaction;
    if(!t||t.amount>=0)return sum;
    const matches=plan.sourceType==="LOAN"?t.type==="LOAN_PAYMENT"&&t.loanId===plan.sourceId:t.type==="CREDIT_CARD_PAYMENT"&&t.creditCardId===plan.sourceId;
    return sum+(matches?Math.min(link.amount,Math.abs(t.amount)):0);
  },0);
}
