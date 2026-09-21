import { describe, expect, it } from "vitest";
import { classifyObligation, validateDueDate, cardStatementSummary, linkedPlanActual } from "@/lib/financial-obligations";

describe("financial obligation dates", () => {
  it.each([
    [null, "UNSET", true], [new Date("2026-10-25"), "ESTIMATED", true],
    [null, "CONFIRMED", false], [new Date("2026-10-25"), "UNSET", false],
    [new Date("invalid"), "CONFIRMED", false],
  ] as const)("validates date %s with confidence %s", (date, status, expected) => {
    expect(validateDueDate(date, status)).toBe(expected);
  });
  it("keeps a partially paid confirmed bill overdue for its remainder", () => {
    expect(classifyObligation({ dueDate: new Date("2026-09-10"), dueDateStatus: "CONFIRMED", remaining: 500 }, new Date("2026-09-17"))).toBe("OVERDUE");
  });
  it("never schedules an unset date", () => {
    expect(classifyObligation({ dueDate: null, dueDateStatus: "UNSET", remaining: 3571173 }, new Date("2026-09-17"))).toBe("UNSCHEDULED");
  });
  it("does not turn an estimated past date into confirmed overdue", () => {
    expect(classifyObligation({ dueDate: new Date("2026-09-10"), dueDateStatus: "ESTIMATED", remaining: 100 }, new Date("2026-09-17"))).toBe("NEEDS_CONFIRMATION");
  });
  it("uses whole Manila calendar days and includes the seventh upcoming day", () => {
    expect(classifyObligation({ dueDate: new Date("2026-09-24"), dueDateStatus: "CONFIRMED", remaining: 100 }, new Date("2026-09-17T12:00:00Z"))).toBe("UPCOMING");
    expect(classifyObligation({ dueDate: new Date("2026-09-17"), dueDateStatus: "CONFIRMED", remaining: 100 }, new Date("2026-09-17T12:00:00Z"))).toBe("UPCOMING");
  });
  it("excludes completed obligations even when their dates are past", () => {
    expect(classifyObligation({ dueDate: new Date("2026-09-10"), dueDateStatus: "CONFIRMED", remaining: 0 }, new Date("2026-09-17"))).toBe("PAID");
  });
});

describe("card statements versus total liabilities", () => {
  it("only counts links to the named card's current negative payment ledger row",()=>{
    expect(linkedPlanActual({sourceType:"CREDIT_CARD",sourceId:"maya",payments:[{amount:749404,transaction:{type:"CREDIT_CARD_PAYMENT",amount:-749404,creditCardId:"maya",loanId:null}},{amount:100,transaction:{type:"EXPENSE",amount:-100,creditCardId:"maya",loanId:null}},{amount:200,transaction:{type:"CREDIT_CARD_PAYMENT",amount:-200,creditCardId:"other",loanId:null}}]})).toBe(749404);
  });
  it("keeps UnionBank statement and unbilled debt separate", () => {
    expect(cardStatementSummary(5911173, 3571173, 0, 2340000)).toEqual({ statementAmount: 3571173, statementRemaining: 3571173, unbilled: 2340000 });
    expect(cardStatementSummary(2340000, 3571173, 3571173, 2340000)).toEqual({ statementAmount: 3571173, statementRemaining: 0, unbilled: 2340000 });
  });
  it("does not hide other Maya debt after paying its statement", () => {
    expect(cardStatementSummary(1869566, 749404, 749404)).toEqual({ statementAmount: 749404, statementRemaining: 0, unbilled: null });
  });
});
