import {describe,it,expect} from "vitest";
import {nextStatementDate,projectCardStatement} from "./card-statements";
import {creditCardSchema} from "./validations/credit-card";
const d=(s:string)=>new Date(s);
const card={id:"cc",accountId:"card",creditLimit:3500000,statementDay:12,paymentDueDay:5,monthlyInterestEstimate:3,account:{openingBalance:3500000}};
const purchase=(id:string,date:string,amount:number)=>({id,date:d(date),accountId:"card",amount:-amount,type:"EXPENSE",status:"CLEARED"});
describe("automatic card statement projection",()=>{
 it("assigns cutoff-day purchases to this statement and later purchases to the following one",()=>{
  expect(nextStatementDate(d("2026-09-12T12:00:00Z"),12).toISOString()).toBe("2026-09-12T00:00:00.000Z");
  expect(nextStatementDate(d("2026-09-13"),12).toISOString()).toBe("2026-10-12T00:00:00.000Z");
 });
 it("clamps month-end cutoffs and crosses December safely",()=>{
  expect(nextStatementDate(d("2027-02-28"),31).toISOString()).toBe("2027-02-28T00:00:00.000Z");
  expect(nextStatementDate(d("2026-12-31"),12).toISOString()).toBe("2027-01-12T00:00:00.000Z");
 });
 it("uses the Manila posted date when UTC falls on the previous day or month",()=>{
  expect(nextStatementDate(d("2026-09-12T18:00:00Z"),12).toISOString()).toBe("2026-10-12T00:00:00.000Z");
  expect(nextStatementDate(d("2026-12-31T18:00:00Z"),12).toISOString()).toBe("2027-01-12T00:00:00.000Z");
  expect(projectCardStatement(card,d("2026-09-12"),[purchase("late","2026-09-12T18:00:00Z",100000)],[],d("2026-09-18")).principal).toBe(0);
 });
 it("includes only this card's purchases through the cutoff, without creating cash entries",()=>{
  const tx=[purchase("a","2026-09-11",100000),purchase("b","2026-09-13",200000),{...purchase("c","2026-09-10",900000),accountId:"other"}];
  const before=JSON.stringify(tx); const result=projectCardStatement(card,d("2026-09-12"),tx,[],d("2026-09-18"));
  expect(result).toMatchObject({principal:100000,estimatedInterest:0,expected:100000,actual:0,remaining:100000});
  expect(result.dueDate?.toISOString()).toBe("2026-10-05T00:00:00.000Z");expect(JSON.stringify(tx)).toBe(before);
 });
 it("carries unpaid principal forward and estimates interest separately without compounding estimates",()=>{
  const tx=[purchase("a","2026-09-11",100000),purchase("b","2026-09-13",200000),{id:"paid",date:d("2026-10-04"),accountId:"card",amount:40000,type:"CREDIT_CARD_PAYMENT",status:"CLEARED"}];
  const result=projectCardStatement(card,d("2026-10-12"),tx,[],d("2026-10-15"));
  expect(result).toMatchObject({principal:260000,interestBase:60000,estimatedInterest:1800,expected:261800,actual:0});
 });
 it("counts the paired card payment once and does not charge interest on new purchases",()=>{
  const tx=[purchase("a","2026-09-11",100000),purchase("b","2026-09-13",200000),{id:"in",date:d("2026-10-04"),accountId:"card",amount:100000,type:"CREDIT_CARD_PAYMENT",status:"CLEARED"},{id:"out",date:d("2026-10-04"),accountId:"cash",amount:-100000,type:"CREDIT_CARD_PAYMENT",status:"CLEARED"}];
  expect(projectCardStatement(card,d("2026-10-12"),tx,[],d("2026-10-15"))).toMatchObject({principal:200000,estimatedInterest:0});
  expect(projectCardStatement(card,d("2026-09-12"),tx,[],d("2026-10-05"))).toMatchObject({actual:100000,remaining:0});
 });
 it("preserves a confirmed statement and assigns later charges to the next statement",()=>{
  const c={...card,account:{openingBalance:247035}};
  const plans=[{sourceId:"cc",statementDate:d("2026-09-12"),statementAmount:2538983,dueDate:d("2026-10-05"),dueDateStatus:"CONFIRMED" as const}];
  const tx=[purchase("new","2026-09-18",10000)];
  expect(projectCardStatement(c,d("2026-09-12"),tx,plans,d("2026-09-18"))).toMatchObject({principal:2538983,dueDateStatus:"CONFIRMED"});
  expect(projectCardStatement(c,d("2026-10-12"),tx,plans,d("2026-09-18"))).toMatchObject({principal:3262965,estimatedInterest:76169});
 });
 it("does not repeat historical purchases already included in an expected statement",()=>{
  const c={...card,creditLimit:9900000,statementDay:5,paymentDueDay:25,account:{openingBalance:9900000}};
  const tx=[purchase("a","2026-09-06",3000000),purchase("b","2026-09-10",1551914),purchase("new","2026-09-18",10000)];
  const plans=[{sourceId:"cc",statementDate:d("2026-10-05"),statementAmount:4551914,dueDate:d("2026-10-25"),dueDateStatus:"ESTIMATED" as const}];
  expect(projectCardStatement(c,d("2026-10-05"),tx,plans,d("2026-09-18"))).toMatchObject({principal:4561914,dueDateStatus:"ESTIMATED"});
 });
 it("keeps an unconfirmed due date unset and does not guess overdue interest",()=>{
  const plans=[{sourceId:"cc",statementDate:d("2026-09-12"),statementAmount:100000,dueDate:null,dueDateStatus:"UNSET" as const}];
  expect(projectCardStatement(card,d("2026-10-12"),[purchase("a","2026-09-11",100000)],plans,d("2026-10-15"))).toMatchObject({dueDate:null,dueDateStatus:"UNSET",estimatedInterest:0});
  expect(projectCardStatement(card,d("2026-10-12"),[purchase("a","2026-09-11",100000)],[{...plans[0],statementDate:null}],d("2026-10-15"))).toMatchObject({dueDate:null,dueDateStatus:"UNSET",estimatedInterest:0});
 });
 it("reflects refunds, purchase edits and deletions on repeat runs with stable statement identity",()=>{
  const tx=[purchase("a","2026-09-11",100000),{id:"refund",date:d("2026-09-12"),accountId:"card",amount:20000,type:"REFUND",status:"CLEARED"}];
  const first=projectCardStatement(card,d("2026-09-12"),tx,[],d("2026-09-18"));
  expect(first.principal).toBe(80000);expect(projectCardStatement(card,d("2026-09-12"),tx,[],d("2026-09-18"))).toEqual(first);
  expect(projectCardStatement(card,d("2026-09-12"),[purchase("a","2026-09-11",50000),tx[1]],[],d("2026-09-18")).principal).toBe(30000);
  expect(projectCardStatement(card,d("2026-09-12"),[],[],d("2026-09-18")).principal).toBe(0);
 });
 it("does not apply a new-purchase refund against an older unpaid statement's interest base",()=>{
  const tx=[purchase("prior","2026-09-11",100000),purchase("new","2026-09-18",200000),{id:"refund",date:d("2026-09-19"),accountId:"card",amount:5000,type:"REFUND",status:"CLEARED",linkedTransactionId:"new"}];
  expect(projectCardStatement(card,d("2026-10-12"),tx,[],d("2026-09-20"))).toMatchObject({principal:295000,interestBase:100000,estimatedInterest:3000});
  expect(projectCardStatement(card,d("2026-10-12"),[...tx.slice(0,2),{...tx[2],linkedTransactionId:"prior"}],[],d("2026-09-20"))).toMatchObject({interestBase:95000,estimatedInterest:2850});
  expect(projectCardStatement(card,d("2026-09-12"),tx,[],d("2026-09-20"))).toMatchObject({expected:100000});
 });
 it("replaces the interest estimate with the confirmed bank charge instead of counting both",()=>{
  const tx=[purchase("prior","2026-09-11",100000),purchase("new","2026-09-18",200000),{...purchase("interest","2026-10-12",2500),cardInterestStatementDate:d("2026-10-12")}];
  expect(projectCardStatement(card,d("2026-10-12"),tx,[],d("2026-10-13"))).toMatchObject({principal:302500,estimatedInterest:0,confirmedInterest:2500,expected:302500});
 });
 it("keeps an estimated statement a forecast after its date passes",()=>{
  const plans=[{sourceId:"cc",statementDate:d("2026-09-12"),statementAmount:90000,dueDate:d("2026-10-05"),dueDateStatus:"ESTIMATED" as const}];
  expect(projectCardStatement(card,d("2026-09-12"),[purchase("prior","2026-09-11",100000)],plans,d("2026-09-18"))).toMatchObject({principal:100000,isVerified:false});
 });
 it("excludes pending transactions and supports an editable rate without changing APR",()=>{
  expect(projectCardStatement(card,d("2026-09-12"),[{...purchase("a","2026-09-11",100000),status:"PENDING"}],[],d("2026-09-18")).principal).toBe(0);
  const result=creditCardSchema.parse({accountId:"a",creditLimit:35000,statementDay:12,paymentDueDay:5,interestRate:24,monthlyInterestEstimate:2.5});
  expect(result).toMatchObject({interestRate:24,monthlyInterestEstimate:2.5});
  expect(creditCardSchema.safeParse({...result,monthlyInterestEstimate:-1}).success).toBe(false);
 });
});
