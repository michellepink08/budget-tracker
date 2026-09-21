import {it,expect} from "vitest";
import {listCycleObligations} from "./financial-obligation-view";
it("creates a read-only automatic next-statement payable from card purchases in the due cycle",async()=>{
 const p:any={budgetPeriod:{findFirst:async()=>({id:"next",startDate:new Date("2026-10-11"),endDate:new Date("2026-11-10")})},loan:{findMany:async()=>[]},creditCard:{findMany:async()=>[{id:"bpi",accountId:"card",creditLimit:3500000,statementDay:12,paymentDueDay:5,monthlyInterestEstimate:3,account:{name:"BPI",openingBalance:3500000}}]},transaction:{findMany:async()=>[{id:"purchase",accountId:"card",amount:-100000,type:"EXPENSE",status:"CLEARED",date:new Date("2026-09-18")}]},cyclePaymentPlan:{findMany:async()=>[]}};
 const first=await listCycleObligations(p,"u","next");
 expect(first[0]).toMatchObject({name:"BPI",expected:100000,remaining:100000,actual:0,statementDate:new Date("2026-10-12"),dueDate:new Date("2026-11-05"),dueDateStatus:"ESTIMATED",automaticPrincipal:100000,estimatedInterest:0});
 expect(await listCycleObligations(p,"u","next")).toEqual(first);
});
it("projects the existing unscheduled UnionBank plan without inventing a due date",async()=>{
 const prisma:any={budgetPeriod:{findFirst:async()=>({id:"cycle",startDate:new Date("2026-09-11"),endDate:new Date("2026-10-10")})},loan:{findMany:async()=>[]},creditCard:{findMany:async()=>[{id:"ub",paymentDueDay:10,account:{name:"UnionBank"}}]},transaction:{findMany:async()=>[]},cyclePaymentPlan:{findMany:async()=>[{sourceType:"CREDIT_CARD",sourceId:"ub",expectedAmount:3571173,dueDate:null,dueDateStatus:"UNSET",payments:[]}]}};
 expect((await listCycleObligations(prisma,"u","cycle"))[0]).toMatchObject({name:"UnionBank",expected:3571173,dueDate:null,dueDateStatus:"UNSET",remaining:3571173});
});
it("preserves overpaid status when a card payment exceeds an explicitly saved budget",async()=>{
 const plan={sourceType:"CREDIT_CARD",sourceId:"bpi",expectedAmount:30000,statementDate:null,statementAmount:null,dueDate:new Date("2026-11-05"),dueDateStatus:"CONFIRMED",payments:[]};
 const p:any={budgetPeriod:{findFirst:async()=>({id:"next",startDate:new Date("2026-10-11"),endDate:new Date("2026-11-10")})},loan:{findMany:async()=>[]},creditCard:{findMany:async()=>[{id:"bpi",accountId:"card",creditLimit:3500000,statementDay:12,paymentDueDay:5,monthlyInterestEstimate:3,account:{name:"BPI",openingBalance:3400000}}]},transaction:{findMany:async()=>[{id:"out",accountId:"cash",creditCardId:"bpi",loanId:null,amount:-40000,type:"CREDIT_CARD_PAYMENT",status:"CLEARED",date:new Date("2026-11-02")},{id:"in",accountId:"card",creditCardId:null,loanId:null,amount:40000,type:"CREDIT_CARD_PAYMENT",status:"CLEARED",date:new Date("2026-11-02")}]},cyclePaymentPlan:{findMany:async()=>[plan]}};
 expect((await listCycleObligations(p,"u","next"))[0]).toMatchObject({expected:30000,actual:40000,remaining:-10000,status:"OVERPAID",statementPayable:103000});
});
