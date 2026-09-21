import type {PrismaClient} from "@prisma/client";
import {buildMonthlyObligations} from "@/lib/monthly-obligations";
import {listCyclePaymentPlans} from "@/lib/cycle-payment-plans";
import {projectCardStatement,statementBeforeDue,nextStatementDate} from "@/lib/card-statements";
export function dueDateInCycle(start:Date,end:Date,day:number|null){
  if(!day)return null;
  for(let cursor=new Date(Date.UTC(start.getUTCFullYear(),start.getUTCMonth(),1));cursor<=end;cursor=new Date(Date.UTC(cursor.getUTCFullYear(),cursor.getUTCMonth()+1,1))){
    const year=cursor.getUTCFullYear(),month=cursor.getUTCMonth();
    const date=new Date(Date.UTC(year,month,Math.min(day,new Date(Date.UTC(year,month+1,0)).getUTCDate())));
    if(date>=start&&date<=end)return date;
  }
  return null;
}
export async function listCycleObligations(prisma:Pick<PrismaClient,"budgetPeriod"|"loan"|"creditCard"|"transaction"|"cyclePaymentPlan">,userId:string,periodId:string,currency="PHP"){
  const period=await prisma.budgetPeriod.findFirst({where:{id:periodId,userId}});if(!period)throw Error("Owned cycle not found");
  const [loans,cards,transactions,plans,history,cardPlans]=await Promise.all([
    prisma.loan.findMany({where:{userId,archivedAt:null}}),
    prisma.creditCard.findMany({where:{userId},include:{account:true}}),
    prisma.transaction.findMany({where:{userId,budgetPeriodId:periodId,date:{gte:period.startDate,lt:new Date(period.endDate.getTime()+86400000)}}}),
    listCyclePaymentPlans(prisma,userId,periodId),
    prisma.transaction.findMany({where:{userId},orderBy:{date:"asc"}}),
    prisma.cyclePaymentPlan.findMany({where:{userId,sourceType:"CREDIT_CARD"},orderBy:{budgetPeriod:{startDate:"asc"}}}),
  ]);
  const result=buildMonthlyObligations({currency,payables:[],installments:[],loans:loans.map(loan=>({...loan,dueDate:dueDateInCycle(period.startDate,period.endDate,loan.dueDay)})),cards:cards.map(card=>({id:card.id,name:card.account.name,dueDate:dueDateInCycle(period.startDate,period.endDate,card.paymentDueDay)})),plans,transactions});
  const now=new Date();
  result.sections.CREDIT_CARDS=result.sections.CREDIT_CARDS.map(row=>{
    const card=cards.find(c=>c.id===row.sourceId)!;
    // Incomplete imported metadata cannot safely produce a statement.
    if(!card.statementDay||!Number.isSafeInteger(card.creditLimit)||!Number.isSafeInteger(card.account.openingBalance))return row;
    const plan=plans.find(p=>p.sourceType==="CREDIT_CARD"&&p.sourceId===card.id);
    const statement=plan?.statementDate??(row.dueDate?statementBeforeDue(row.dueDate,card.statementDay):nextStatementDate(period.startDate,card.statementDay));
    const projection=projectCardStatement(card,statement,history,cardPlans,now);
    // Preserve verified statements and explicitly saved payment amounts. Only an
    // upcoming statement's unedited full-payment forecast follows new purchases.
    const automatic=!plan||Boolean(plan.statementDate&&(plan.statementDate>now||plan.dueDateStatus!=="CONFIRMED")&&plan.expectedAmount===plan.statementAmount);
    const expected=automatic?projection.expected:row.expected;
    const actual=automatic?projection.actual:row.actual;
    const unknownStatement=Boolean(plan&&!plan.statementDate&&plan.statementAmount!==null);
    const status=expected===0?"UNPLANNED" as const:actual>expected?"OVERPAID" as const:actual===expected?"PAID" as const:actual>0?"PARTIAL" as const:"UPCOMING" as const;
    return {...row,expected,actual,remaining:expected-actual,status,dueDate:plan?row.dueDate:projection.dueDate,dueDateStatus:plan?row.dueDateStatus:projection.dueDateStatus,statementDate:unknownStatement?undefined:statement,statementPayable:unknownStatement?undefined:projection.expected,automaticPrincipal:projection.principal,estimatedInterest:projection.estimatedInterest,confirmedInterest:projection.confirmedInterest,automaticallyCalculated:automatic,...(automatic?{actualTransactionIds:projection.actualTransactionIds}:{})};
  });
  return [...result.sections.LOANS_INSTALLMENTS,...result.sections.CREDIT_CARDS];
}
