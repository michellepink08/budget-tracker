import { describe, expect, it } from "vitest";
import { buildOverdueObligations, startOfDayInTimeZone } from "@/lib/dashboard-overdue";

describe("buildOverdueObligations", () => {
  it("uses confirmed plan remainder for partially paid overdue obligations",()=>{
    const rows=buildOverdueObligations({today:new Date("2026-09-17"),loans:[],cards:[{id:"ub",name:"UnionBank",dueDay:10}],transactions:[],obligations:[{id:"ub",sourceId:"ub",sourceType:"CREDIT_CARD",name:"UnionBank",dueDate:null,dueDateStatus:"UNSET",remaining:3571173},{id:"partial",sourceId:"partial",sourceType:"LOAN",name:"Partial loan",dueDate:new Date("2026-09-10"),dueDateStatus:"CONFIRMED",remaining:500}]});
    expect(rows).toEqual([{id:"partial",sourceType:"LOAN",name:"Partial loan",amount:500,dueDate:new Date("2026-09-10")}]);
  });
  it("uses the Philippine calendar day for an overnight UTC timestamp", () => {
    expect(startOfDayInTimeZone(new Date("2026-09-15T23:42:00.000Z"), "Asia/Manila")).toEqual(new Date(2026, 8, 16));
  });

  it("shows only past-due loans and cards that have not been paid this month", () => {
    const rows = buildOverdueObligations({
      today: new Date(2026, 8, 16),
      loans: [
        { id: "loan-late", name: "SPayLater", dueDay: 15, monthlyPayment: 1926719, startDate: new Date(2026, 0, 1), endDate: null },
        { id: "loan-paid", name: "GLoan", dueDay: 14, monthlyPayment: 769583, startDate: new Date(2026, 0, 1), endDate: null },
      ],
      cards: [
        { id: "card-late", name: "BPI Amore", dueDay: 5 },
        { id: "card-future", name: "EastWest", dueDay: 25 },
      ],
      transactions: [{ loanId: "loan-paid", creditCardId: null, date: new Date(2026, 8, 15) }],
    });

    expect(rows).toEqual([
      { id: "card-late", sourceType: "CREDIT_CARD", name: "BPI Amore", amount: null, dueDate: new Date(2026, 8, 5) },
      { id: "loan-late", sourceType: "LOAN", name: "SPayLater", amount: 1926719, dueDate: new Date(2026, 8, 15) },
    ]);
  });
});
