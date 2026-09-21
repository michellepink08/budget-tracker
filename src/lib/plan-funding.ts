import {toMajorUnits} from "@/lib/money";

export function planAmountInputValue(planned:number,currency:string):string{
 return planned===0?"":String(toMajorUnits(planned,currency));
}
export function computePlanFunding(opening:number,expected:number,allocated:number){return {available:opening+expected,allocated,remaining:opening+expected-allocated}}
export type PlanDraft={kind:"income"|"allocation";base:number;value:number};
export function applyPlanDrafts(opening:number,expected:number,allocated:number,drafts:PlanDraft[]){
  const income=expected+drafts.filter(d=>d.kind==="income").reduce((s,d)=>s+d.value-d.base,0);
  const planned=allocated+drafts.filter(d=>d.kind==="allocation").reduce((s,d)=>s+d.value-d.base,0);
  return {...computePlanFunding(opening,income,planned),expected:income};
}
export type WorksheetRow={key:string;label:string;kind:string;categoryId:string;subcategoryId:string|null;allocationId:string|null;planned:number;rollover:number;actual:number;rolloverMode:string;showDailyAllowance:boolean};
type WorksheetCategory={id:string;name:string;type:string;subcategories:{id:string;name:string}[]};
type WorksheetAllocation={id:string;categoryId:string;subcategoryId:string|null;plannedAmount:number;rolloverAmount:number;effectivePlanned:number;actual:number;rolloverMode:string;showDailyAllowance:boolean};
type WorksheetTransaction={id:string;type:string;categoryId:string|null;subcategoryId:string|null;amount:number};
export function buildWorksheetRows(categories:WorksheetCategory[],allocations:WorksheetAllocation[],transactions:WorksheetTransaction[]):WorksheetRow[]{
 return categories.filter(c=>["EXPENSE","SAVINGS"].includes(c.type)).flatMap(category=>{
  const existing=allocations.filter(a=>a.categoryId===category.id);
  const whole=existing.find(a=>a.subcategoryId===null);
  const slots=whole||!category.subcategories.length?[{id:null,name:null}]:category.subcategories;
  return slots.map(slot=>{
   const a=whole??existing.find(a=>a.subcategoryId===slot.id);
   const eligible=transactions.filter(t=>t.categoryId===category.id&&(!slot.id||t.subcategoryId===slot.id)&&(category.type==="SAVINGS"?t.type==="SAVINGS":["EXPENSE","REFUND","TRANSFER_FEE"].includes(t.type)));
   return {key:`${category.id}:${slot.id??"all"}`,label:slot.name?`${category.name} — ${slot.name}`:category.name,kind:category.type,categoryId:category.id,subcategoryId:slot.id,allocationId:a?.id??null,planned:a?.plannedAmount??0,rollover:a?.rolloverAmount??0,actual:-eligible.reduce((s,t)=>s+t.amount,0),rolloverMode:a?.rolloverMode??"NONE",showDailyAllowance:a?.showDailyAllowance??false};
  });
 });
}
/** Pass pre-cycle transactions only, never current-cycle receipts. */
export function computeOpeningSpendable(accounts:{id:string;purpose:string;accountType:string;openingBalance:number}[],transactions:{accountId:string;amount:number}[],earmarks=0):number{
 const spendable=accounts.filter(a=>a.purpose==="DISPOSABLE"&&a.accountType!=="CREDIT_CARD"&&a.accountType!=="LOAN");const ids=new Set(spendable.map(a=>a.id));return spendable.reduce((s,a)=>s+a.openingBalance,0)+transactions.filter(t=>ids.has(t.accountId)).reduce((s,t)=>s+t.amount,0)-earmarks;
}
