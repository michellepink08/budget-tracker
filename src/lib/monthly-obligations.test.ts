import { describe, expect, it } from "vitest";
import { buildMonthlyObligations } from "@/lib/monthly-obligations";

describe("buildMonthlyObligations", () => {
  it("does not fall back to a card due day when its plan date is unset", () => {
    const result=buildMonthlyObligations({currency:"PHP",payables:[],loans:[],installments:[],transactions:[],cards:[{id:"ub",name:"UnionBank",dueDate:new Date("2026-10-10")}],plans:[{sourceType:"CREDIT_CARD",sourceId:"ub",expectedAmount:3571173,dueDate:null,dueDateStatus:"UNSET"}]});
    expect(result.sections.CREDIT_CARDS[0]).toMatchObject({dueDate:null,dueDateStatus:"UNSET",remaining:3571173});
  });
  it("uses a saved loan plan instead of the normal monthly amount", () => {
    const result = buildMonthlyObligations({
      currency: "PHP",
      payables: [], installments: [], cards: [], transactions: [],
      loans: [{ id: "loan-1", name: "SPayLater", monthlyPayment: 150_000, dueDate: new Date("2026-09-15") }],
      plans: [{ sourceType: "LOAN", sourceId: "loan-1", expectedAmount: 200_000, dueDate: new Date("2026-09-15") }],
    });

    expect(result.sections.LOANS_INSTALLMENTS[0]).toMatchObject({ expected: 200_000, actual: 0, remaining: 200_000, status: "UPCOMING" });
  });

  it("keeps an unplanned credit card visible", () => {
    const result = buildMonthlyObligations({
      currency: "PHP", payables: [], loans: [], installments: [], plans: [], transactions: [],
      cards: [{ id: "card-1", name: "BPI Amore", dueDate: new Date("2026-10-05") }],
    });

    expect(result.sections.CREDIT_CARDS[0]).toMatchObject({ expected: 0, actual: 0, status: "UNPLANNED" });
  });

  it("does not apply one loan payment to another loan", () => {
    const result = buildMonthlyObligations({
      currency: "PHP", payables: [], installments: [], cards: [], plans: [],
      loans: [
        { id: "loan-a", name: "A", monthlyPayment: 100_000, dueDate: null },
        { id: "loan-b", name: "B", monthlyPayment: 100_000, dueDate: null },
      ],
      transactions: [{ type:"LOAN_PAYMENT", loanId: "loan-a", creditCardId: null, amount: -100_000 }],
    });

    expect(result.sections.LOANS_INSTALLMENTS.map((row) => [row.sourceId, row.actual])).toEqual([["loan-a", 100_000], ["loan-b", 0]]);
  });
});
