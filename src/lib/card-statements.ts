import type {DueDateStatus} from "./financial-obligations";

export type StatementCard={id:string;accountId:string;creditLimit:number;statementDay:number;paymentDueDay:number;monthlyInterestEstimate?:number;account:{openingBalance:number}};
export type StatementTransaction={id:string;date:Date;accountId:string;amount:number;type:string;status?:string;linkedTransactionId?:string|null;cardInterestStatementDate?:Date|null};
export type StatementPlan={sourceId:string;statementDate?:Date|null;statementAmount?:number|null;dueDate:Date|null;dueDateStatus?:DueDateStatus};
const formatter=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Manila",year:"numeric",month:"2-digit",day:"2-digit"});
const key=(date:Date)=>formatter.format(date);
const dayOnly=(date:Date)=>new Date(`${key(date)}T00:00:00Z`);
export function clampedCardDate(year:number,month:number,day:number){return new Date(Date.UTC(year,month,Math.min(day,new Date(Date.UTC(year,month+1,0)).getUTCDate())));}
export function nextStatementDate(date:Date,day:number):Date{
 date=dayOnly(date);
 const cutoff=clampedCardDate(date.getUTCFullYear(),date.getUTCMonth(),day);
 return key(date)<=key(cutoff)?cutoff:clampedCardDate(date.getUTCFullYear(),date.getUTCMonth()+1,day);
}
export function statementBeforeDue(due:Date,day:number){
 due=dayOnly(due);
 const candidate=clampedCardDate(due.getUTCFullYear(),due.getUTCMonth(),day);
 return key(candidate)<key(due)?candidate:clampedCardDate(due.getUTCFullYear(),due.getUTCMonth()-1,day);
}
function dueAfterStatement(date:Date,day:number){
 const candidate=clampedCardDate(date.getUTCFullYear(),date.getUTCMonth(),day);
 return key(candidate)>key(date)?candidate:clampedCardDate(date.getUTCFullYear(),date.getUTCMonth()+1,day);
}

// Projection only: no payable, expense, interest charge or account adjustment is written.
// Account ledger amounts are signed available-credit movements, so debt is their inverse.
export function projectCardStatement(card:StatementCard,date:Date,transactions:StatementTransaction[],plans:StatementPlan[],now:Date){
 date=dayOnly(date);
 const own=transactions.filter(t=>t.accountId===card.accountId&&t.status!=="PENDING");
 const snapshots=plans.filter(p=>p.sourceId===card.id&&p.statementDate).sort((a,b)=>a.statementDate!.getTime()-b.statementDate!.getTime());
 const snapshot=snapshots.find(p=>key(p.statementDate!)===key(date));
 const previous=clampedCardDate(date.getUTCFullYear(),date.getUTCMonth()-1,card.statementDay);
 const previousSnapshot=snapshots.find(p=>key(p.statementDate!)===key(previous));
 const latest=snapshots.filter(p=>key(p.statementDate!)<=key(date)).at(-1)??plans.filter(p=>p.sourceId===card.id&&!p.statementDate).at(-1);
 const debtAt=(cutoff:Date)=>Math.max(0,card.creditLimit-card.account.openingBalance-own.filter(t=>key(t.cardInterestStatementDate??t.date)<=key(cutoff)).reduce((s,t)=>s+t.amount,0));
 const verified=Boolean(snapshot?.statementAmount!==null&&snapshot?.statementAmount!==undefined&&snapshot.dueDateStatus==="CONFIRMED"&&key(date)<=key(now));
 const principal=verified?snapshot!.statementAmount!:debtAt(date);
 const dueDateStatus:DueDateStatus=snapshot?.dueDateStatus??(latest?.dueDateStatus==="UNSET"?"UNSET":"ESTIMATED");
 const dueDate=dueDateStatus==="UNSET"?null:snapshot?.dueDate??dueAfterStatement(date,card.paymentDueDay);
 const previousDue=previousSnapshot?.dueDateStatus==="UNSET"||dueDateStatus==="UNSET"?null:previousSnapshot?.dueDate??dueAfterStatement(previous,card.paymentDueDay);
 const priorPrincipal=previousSnapshot?.statementAmount??debtAt(previous);
 const creditsBetween=(start:Date,end:Date)=>own.filter(t=>t.amount>0&&(t.type==="CREDIT_CARD_PAYMENT"||t.type==="REFUND")&&key(t.date)>key(start)&&key(t.date)<=key(end));
 const refundedBefore=(refund:StatementTransaction,cutoff:Date)=>Boolean(own.find(t=>t.id===refund.linkedTransactionId&&t.type==="EXPENSE"&&key(t.date)<=key(cutoff)));
 const interestCredits=creditsBetween(previous,date).filter(t=>t.type==="CREDIT_CARD_PAYMENT"||refundedBefore(t,previous));
 const interestBase=previousDue&&key(previousDue)<key(date)?Math.max(0,priorPrincipal-interestCredits.reduce((s,t)=>s+t.amount,0)):0;
 const confirmedCharges=own.filter(t=>t.type==="EXPENSE"&&t.amount<0&&t.cardInterestStatementDate&&key(t.cardInterestStatementDate)===key(date));
 const confirmedInterest=confirmedCharges.reduce((s,t)=>s+Math.abs(t.amount),0);
 const estimatedInterest=verified||confirmedCharges.length?0:Math.round(interestBase*(card.monthlyInterestEstimate??3)/100);
 const following=clampedCardDate(date.getUTCFullYear(),date.getUTCMonth()+1,card.statementDay);
 const payments=creditsBetween(date,now).filter(t=>key(t.date)<key(following)&&t.type==="CREDIT_CARD_PAYMENT");
 const refunds=creditsBetween(date,now).filter(t=>key(t.date)<key(following)&&t.type==="REFUND"&&refundedBefore(t,date)).reduce((s,t)=>s+t.amount,0);
 const actual=payments.reduce((s,t)=>s+t.amount,0);
 const expected=Math.max(0,principal-refunds)+estimatedInterest;
 return {id:`card-statement:${card.id}:${key(date)}`,statementDate:date,dueDate,dueDateStatus,principal,interestBase,estimatedInterest,confirmedInterest,expected,actual,remaining:Math.max(0,expected-actual),actualTransactionIds:payments.map(t=>t.id),isVerified:verified};
}
