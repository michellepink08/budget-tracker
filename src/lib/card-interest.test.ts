import {it,expect} from "vitest";
import {recordConfirmedCardInterest} from "./card-interest";
const input={amount:2500,date:new Date("2026-10-12"),statementDate:new Date("2026-10-12")};
function database(){
 const rows:any[]=[];const audits:any[]=[];
 const db:any={creditCard:{findFirst:async({where}:any)=>where.id==="cc"&&where.userId==="u"?{id:"cc",accountId:"card",statementDay:12,account:{accountType:"CREDIT_CARD"}}:null},cyclePaymentPlan:{findMany:async()=>[]},budgetPeriod:{findUnique:async()=>({id:"cycle"})},transaction:{findMany:async({where}:any)=>rows.filter(t=>t.userId===where.userId&&t.accountId===where.accountId&&t.cardInterestStatementDate?.getTime()===where.cardInterestStatementDate?.getTime()),create:async({data}:any)=>{const row={id:`t${rows.length}`,status:"CLEARED",...data};rows.push(row);return row;},update:async({where,data}:any)=>{const row=rows.find(t=>t.id===where.id);Object.assign(row,data);return row;}},auditLog:{create:async({data}:any)=>{audits.push(data);return data;}},$executeRaw:async()=>0};
 db.$transaction=async(fn:any)=>fn(db);return {db,rows,audits};
}
it("records actual bank interest as one expense on its own card, not a cash deduction",async()=>{
 const {db,rows}=database();expect(await recordConfirmedCardInterest(db,"u",11,"cc",input)).toMatchObject({ok:true});
 expect(rows).toHaveLength(1);expect(rows[0]).toMatchObject({accountId:"card",type:"EXPENSE",amount:-2500,cardInterestStatementDate:input.statementDate});
});
it("confirming the same interest twice creates no second expense or audit",async()=>{
 const {db,rows,audits}=database();await recordConfirmedCardInterest(db,"u",11,"cc",input);const first=JSON.stringify({rows,audits});
 expect(await recordConfirmedCardInterest(db,"u",11,"cc",input)).toMatchObject({ok:true});expect(JSON.stringify({rows,audits})).toBe(first);
});
it("stops if another interest amount is already confirmed for the statement",async()=>{
 const {db,rows}=database();await recordConfirmedCardInterest(db,"u",11,"cc",input);
 expect(await recordConfirmedCardInterest(db,"u",11,"cc",{...input,amount:3000})).toMatchObject({ok:false});expect(rows).toHaveLength(1);
});
it("cannot charge another user's card",async()=>{
 const {db,rows}=database();expect(await recordConfirmedCardInterest(db,"other",11,"cc",input)).toMatchObject({ok:false});expect(rows).toHaveLength(0);
});
it("stops when a saved confirmed statement may already contain the interest",async()=>{
 const {db,rows}=database();db.cyclePaymentPlan.findMany=async()=>[{statementAmount:100000,dueDateStatus:"CONFIRMED"}];
 expect(await recordConfirmedCardInterest(db,"u",11,"cc",input)).toMatchObject({ok:false});expect(rows).toHaveLength(0);
});
it("rejects invalid amounts and dates without writing financial records",async()=>{
 const {db,rows}=database();for(const value of [0,-1,2.5,NaN])expect(await recordConfirmedCardInterest(db,"u",11,"cc",{...input,amount:value})).toMatchObject({ok:false});
 expect(await recordConfirmedCardInterest(db,"u",11,"cc",{...input,date:new Date("invalid")})).toMatchObject({ok:false});expect(rows).toHaveLength(0);
});
