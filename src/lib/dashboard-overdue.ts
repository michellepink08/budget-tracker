import {classifyObligation,type DueDateStatus} from "@/lib/financial-obligations";
export type OverdueObligation = {
  id: string;
  sourceType: "LOAN" | "CREDIT_CARD";
  name: string;
  amount: number | null;
  dueDate: Date;
};

type Input = {
  today: Date;
  loans: { id: string; name: string; dueDay: number | null; monthlyPayment: number; startDate: Date; endDate: Date | null }[];
  cards: { id: string; name: string; dueDay: number }[];
  transactions: { loanId: string | null; creditCardId: string | null; date: Date }[];
  obligations?: {id:string;sourceId:string;sourceType:string;name:string;dueDate:Date|null;dueDateStatus?:DueDateStatus;remaining:number}[];
};

export function startOfDayInTimeZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "numeric", day: "numeric" }).formatToParts(date);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return new Date(value("year"), value("month") - 1, value("day"));
}

function dueDateInCurrentMonth(today: Date, dueDay: number) {
  return new Date(today.getFullYear(), today.getMonth(), Math.min(dueDay, new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()));
}

export function buildOverdueObligations({ today, loans, cards, transactions, obligations }: Input): OverdueObligation[] {
  if(obligations) return obligations.filter(row=>(row.sourceType==="LOAN"||row.sourceType==="CREDIT_CARD")&&classifyObligation({...row,dueDateStatus:row.dueDateStatus??"ESTIMATED"},today)==="OVERDUE").map(row=>({id:row.sourceId,sourceType:row.sourceType as "LOAN"|"CREDIT_CARD",name:row.name,amount:row.remaining,dueDate:row.dueDate!})).sort((a,b)=>a.dueDate.getTime()-b.dueDate.getTime());
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const paidLoanIds = new Set(transactions.filter((item) => item.date >= monthStart && item.date <= today && item.loanId).map((item) => item.loanId));
  const paidCardIds = new Set(transactions.filter((item) => item.date >= monthStart && item.date <= today && item.creditCardId).map((item) => item.creditCardId));

  const overdueLoans = loans.flatMap((loan) => {
    if (!loan.dueDay || paidLoanIds.has(loan.id)) return [];
    const dueDate = dueDateInCurrentMonth(today, loan.dueDay);
    if (dueDate >= today || dueDate < loan.startDate || (loan.endDate && dueDate > loan.endDate)) return [];
    return [{ id: loan.id, sourceType: "LOAN" as const, name: loan.name, amount: loan.monthlyPayment, dueDate }];
  });
  const overdueCards = cards.flatMap((card) => {
    if (paidCardIds.has(card.id)) return [];
    const dueDate = dueDateInCurrentMonth(today, card.dueDay);
    return dueDate < today ? [{ id: card.id, sourceType: "CREDIT_CARD" as const, name: card.name, amount: null, dueDate }] : [];
  });

  return [...overdueLoans, ...overdueCards].sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
}
