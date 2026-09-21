import { humanizeEnum } from "./enum-labels";
export type ActivityTransaction = { id: string; accountId: string; amount: number; linkedTransactionId: string | null; type: string; date: Date; description: string; status: string };
export type ActivityAccount = { id: string; name: string; accountType: string };
export type AccountActivity = { id: string; date: Date; description: string; label: string; status: string; transactionIds: string[]; amounts: Record<string, number> };
/** Presentation only: never creates or changes ledger records. */
export function buildAccountActivity(transactions:ActivityTransaction[],accounts:ActivityAccount[]):AccountActivity[]{
 const byId=new Map(transactions.map(t=>[t.id,t]));const cards=new Set(accounts.filter(a=>a.accountType==="CREDIT_CARD").map(a=>a.id));const seen=new Set<string>();
 return transactions.flatMap(t=>{if(seen.has(t.id))return [];const partner=t.linkedTransactionId?byId.get(t.linkedTransactionId):undefined;const pair=partner&&partner.linkedTransactionId===t.id&&!seen.has(partner.id)?[t,partner]:[t];const primary=pair.find(p=>p.amount<0)??t;const amounts:Record<string,number>={};for(const p of pair){seen.add(p.id);amounts[p.accountId]=(amounts[p.accountId]??0)+(cards.has(p.accountId)?-p.amount:p.amount)}const label=primary.type==="LENDING"?"Lent out":primary.type==="RECEIVABLE_REPAYMENT"?"Repayment received":cards.has(primary.accountId)&&primary.type==="EXPENSE"?"Card purchase":humanizeEnum(primary.type);return [{id:primary.id,date:primary.date,description:primary.description,label,status:pair.some(p=>p.status==="PENDING")?"PENDING":"CLEARED",transactionIds:pair.map(p=>p.id),amounts}]});
}
export function lendingStatus(original:number,remaining:number):string{return remaining<=0?"Fully repaid":remaining<original?"Partially repaid":"Unpaid"}
