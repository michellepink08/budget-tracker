import { describe, expect, it } from "vitest";
import { computeOpeningSpendable, computePlanFunding, applyPlanDrafts, buildWorksheetRows, planAmountInputValue } from "./plan-funding";

describe("planning funding", () => {
  it("keeps an unplanned zero out of the editable value so typing starts cleanly",()=>{
    expect(planAmountInputValue(0,"PHP")).toBe("");
    expect(planAmountInputValue(125050,"PHP")).toBe("1250.5");
  });
  it("updates draft funding without adding actual receipts or payments again",()=>{
    expect(applyPlanDrafts(2000000,8000000,9524513,[{kind:"income",base:2200000,value:2500000},{kind:"allocation",base:1000000,value:2000000}]).remaining).toBe(-224513);
  });
  it("reuses saved subcategories without creating double category budgets",()=>{
    const result=buildWorksheetRows([{id:"health",name:"Health",type:"EXPENSE",subcategories:[{id:"hospital",name:"Hospital"},{id:"med",name:"Medicine"}]}],[{id:"a",categoryId:"health",subcategoryId:null,plannedAmount:100000,rolloverAmount:0,effectivePlanned:100000,actual:20000,rolloverMode:"NONE",showDailyAllowance:false}],[]);
    expect(result).toHaveLength(1);expect(result[0].label).toBe("Health");expect(result[0].allocationId).toBe("a");
  });
  it("shows unplanned saved rows and counts only eligible actual spending",()=>{
    const result=buildWorksheetRows([{id:"daily",name:"Daily",type:"EXPENSE",subcategories:[{id:"food",name:"Food"}]}],[],[{id:"x",type:"EXPENSE",categoryId:"daily",subcategoryId:"food",amount:-10000},{id:"y",type:"REFUND",categoryId:"daily",subcategoryId:"food",amount:500},{id:"z",type:"LOAN_PAYMENT",categoryId:"daily",subcategoryId:"food",amount:-30000}]);
    expect(result[0].planned).toBe(0);expect(result[0].actual).toBe(9500);expect(result[0].label).toBe("Daily — Food");
  });
  it("subtracts all allocations once from opening cash plus expected income", () => {
    expect(computePlanFunding(2000000,8000000,9524513)).toEqual({ available:10000000,allocated:9524513,remaining:475487 });
  });
  it("shows negative unassigned funds rather than hiding a shortfall", () => {
    expect(computePlanFunding(2000000,8000000,10524513).remaining).toBe(-524513);
  });
  it("reconstructs opening spendable cash without adding reserved or card funds", () => {
    const accounts=[{id:"a",purpose:"DISPOSABLE",accountType:"SAVINGS",openingBalance:100000},{id:"b",purpose:"RESTRICTED",accountType:"CHECKING",openingBalance:500000},{id:"c",purpose:"CREDIT",accountType:"CREDIT_CARD",openingBalance:900000}];
    expect(computeOpeningSpendable(accounts,[{accountId:"a",amount:20000},{accountId:"a",amount:-5000},{accountId:"b",amount:30000}],10000)).toBe(105000);
  });
});
