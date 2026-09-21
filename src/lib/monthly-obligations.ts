import type {DueDateStatus} from "@/lib/financial-obligations";
export type ObligationSection = "REGULAR_BILLS" | "LOANS_INSTALLMENTS" | "CREDIT_CARDS";
export type ObligationStatus = "UNPLANNED" | "UPCOMING" | "PARTIAL" | "PAID" | "OVERPAID";

export type MonthlyObligationRow = {
  id: string;
  section: ObligationSection;
  sourceType: string;
  sourceId: string;
  name: string;
  expected: number;
  actual: number;
  remaining: number;
  dueDate: Date | null;
  dueDateStatus?: DueDateStatus;
  fundingAccountId?: string | null;
  actualTransactionIds?: string[];
  status: ObligationStatus;
  statementDate?:Date;
  automaticPrincipal?:number;
  estimatedInterest?:number;
  confirmedInterest?:number;
  statementPayable?:number;
  automaticallyCalculated?:boolean;
  currency: string;
};

type Plan = { sourceType: string; sourceId: string; expectedAmount: number; dueDate: Date | null; dueDateStatus?: DueDateStatus; fundingAccountId?: string | null; payments?: {amount:number;transactionId:string;transaction?:PaymentTransaction}[] };
type PaymentTransaction = { id?:string; type?:string; loanId: string | null; creditCardId: string | null; amount: number };
type Input = {
  currency: string;
  payables: { id: string; name: string; amount: number; dueDate: Date; dueDateConfirmed?:boolean; accountId?:string; actual?: number }[];
  loans: { id: string; name: string; monthlyPayment: number; dueDate: Date | null }[];
  installments: { id: string; name: string; amount: number; dueDate: Date; actual?: number }[];
  cards: { id: string; name: string; dueDate: Date | null }[];
  plans: Plan[];
  transactions: PaymentTransaction[];
};

function statusFor(expected: number, actual: number): ObligationStatus {
  if (expected === 0) return "UNPLANNED";
  if (actual > expected) return "OVERPAID";
  if (actual === expected) return "PAID";
  if (actual > 0) return "PARTIAL";
  return "UPCOMING";
}

function planFor(plans: Plan[], sourceType: string, sourceId: string) {
  return plans.find((plan) => plan.sourceType === sourceType && plan.sourceId === sourceId);
}

function row(input: Omit<MonthlyObligationRow, "remaining" | "status">): MonthlyObligationRow {
  const remaining = input.expected - input.actual;
  return { ...input, remaining, status: statusFor(input.expected, input.actual) };
}

function paymentsFor(input:Input,plan:Plan|undefined,sourceType:string,sourceId:string) {
  const eligible=(t:PaymentTransaction)=>t.amount<0&&(sourceType==="LOAN"? t.type==="LOAN_PAYMENT"&&t.loanId===sourceId : t.type==="CREDIT_CARD_PAYMENT"&&t.creditCardId===sourceId);
  const allocated=new Set(input.plans.flatMap(p=>(p.payments??[]).map(link=>link.transactionId)));
  const linked=(plan?.payments??[]).flatMap(link=>{
    const transaction=link.transaction??input.transactions.find(t=>t.id===link.transactionId);
    return transaction&&eligible(transaction)? [{amount:Math.min(link.amount,Math.abs(transaction.amount)),id:link.transactionId}] : [];
  });
  const automatic=input.transactions.filter(t=>eligible(t)&&(!t.id||!allocated.has(t.id))).map(t=>({id:t.id,amount:Math.abs(t.amount)}));
  const all=[...linked,...automatic];
  return {actual:all.reduce((sum,t)=>sum+t.amount,0),actualTransactionIds:all.flatMap(t=>t.id?[t.id]:[])};
}

export function buildMonthlyObligations(input: Input) {
  const sections: Record<ObligationSection, MonthlyObligationRow[]> = {
    REGULAR_BILLS: input.payables.map((payable) => row({
      id: `payable:${payable.id}`, section: "REGULAR_BILLS", sourceType: "PAYABLE", sourceId: payable.id,
      name: payable.name, expected: payable.amount, actual: payable.actual ?? 0, dueDate: payable.dueDate, dueDateStatus:payable.dueDateConfirmed===false?"ESTIMATED":"CONFIRMED",fundingAccountId:payable.accountId,currency: input.currency,
    })),
    LOANS_INSTALLMENTS: [
      ...input.loans.map((loan) => {
        const plan = planFor(input.plans, "LOAN", loan.id);
        const payment=paymentsFor(input,plan,"LOAN",loan.id);
        return row({ id: `loan:${loan.id}`, section: "LOANS_INSTALLMENTS", sourceType: "LOAN", sourceId: loan.id, name: loan.name, expected: plan?.expectedAmount ?? loan.monthlyPayment, ...payment, dueDate: plan ? plan.dueDate : loan.dueDate, dueDateStatus:plan?.dueDateStatus??(loan.dueDate?"ESTIMATED":"UNSET"),fundingAccountId:plan?.fundingAccountId,currency: input.currency });
      }),
      ...input.installments.map((installment) => row({
        id: `installment:${installment.id}`, section: "LOANS_INSTALLMENTS", sourceType: "INSTALLMENT", sourceId: installment.id,
        name: installment.name, expected: installment.amount, actual: installment.actual ?? 0, dueDate: installment.dueDate, currency: input.currency,
      })),
    ],
    CREDIT_CARDS: input.cards.map((card) => {
      const plan = planFor(input.plans, "CREDIT_CARD", card.id);
      const payment=paymentsFor(input,plan,"CREDIT_CARD",card.id);
      return row({ id: `card:${card.id}`, section: "CREDIT_CARDS", sourceType: "CREDIT_CARD", sourceId: card.id, name: card.name, expected: plan?.expectedAmount ?? 0, ...payment, dueDate: plan ? plan.dueDate : card.dueDate, dueDateStatus:plan?.dueDateStatus??(card.dueDate?"ESTIMATED":"UNSET"),fundingAccountId:plan?.fundingAccountId,currency: input.currency });
    }),
  };
  const rows = Object.values(sections).flat();
  return {
    sections,
    totals: {
      expected: rows.reduce((sum, item) => sum + item.expected, 0),
      actual: rows.reduce((sum, item) => sum + item.actual, 0),
      remaining: rows.reduce((sum, item) => sum + item.remaining, 0),
    },
  };
}
