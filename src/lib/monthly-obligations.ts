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
  status: ObligationStatus;
  currency: string;
};

type Plan = { sourceType: string; sourceId: string; expectedAmount: number; dueDate: Date };
type PaymentTransaction = { loanId: string | null; creditCardId: string | null; amount: number };
type Input = {
  currency: string;
  payables: { id: string; name: string; amount: number; dueDate: Date; actual?: number }[];
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

export function buildMonthlyObligations(input: Input) {
  const sections: Record<ObligationSection, MonthlyObligationRow[]> = {
    REGULAR_BILLS: input.payables.map((payable) => row({
      id: `payable:${payable.id}`, section: "REGULAR_BILLS", sourceType: "PAYABLE", sourceId: payable.id,
      name: payable.name, expected: payable.amount, actual: payable.actual ?? 0, dueDate: payable.dueDate, currency: input.currency,
    })),
    LOANS_INSTALLMENTS: [
      ...input.loans.map((loan) => {
        const plan = planFor(input.plans, "LOAN", loan.id);
        const actual = input.transactions.filter((transaction) => transaction.loanId === loan.id).reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0);
        return row({ id: `loan:${loan.id}`, section: "LOANS_INSTALLMENTS", sourceType: "LOAN", sourceId: loan.id, name: loan.name, expected: plan?.expectedAmount ?? loan.monthlyPayment, actual, dueDate: plan?.dueDate ?? loan.dueDate, currency: input.currency });
      }),
      ...input.installments.map((installment) => row({
        id: `installment:${installment.id}`, section: "LOANS_INSTALLMENTS", sourceType: "INSTALLMENT", sourceId: installment.id,
        name: installment.name, expected: installment.amount, actual: installment.actual ?? 0, dueDate: installment.dueDate, currency: input.currency,
      })),
    ],
    CREDIT_CARDS: input.cards.map((card) => {
      const plan = planFor(input.plans, "CREDIT_CARD", card.id);
      const actual = input.transactions.filter((transaction) => transaction.creditCardId === card.id).reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0);
      return row({ id: `card:${card.id}`, section: "CREDIT_CARDS", sourceType: "CREDIT_CARD", sourceId: card.id, name: card.name, expected: plan?.expectedAmount ?? 0, actual, dueDate: plan?.dueDate ?? card.dueDate, currency: input.currency });
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
