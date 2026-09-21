import type {PrismaClient} from "@prisma/client";
import {createExpenseLikeTransaction} from "./transactions";
import {recordAudit} from "./audit-log";
import {nextStatementDate} from "./card-statements";
type Input={amount:number;date:Date;statementDate:Date};
type Result={ok:true;transactionId:string}|{ok:false;error:string};
export async function recordConfirmedCardInterest(db:Pick<PrismaClient,"$transaction">,userId:string,cycleStartDay:number,cardId:string,input:Input):Promise<Result>{
 if(!Number.isSafeInteger(input.amount)||input.amount<=0||!Number.isFinite(input.date.getTime())||!Number.isFinite(input.statementDate.getTime()))return {ok:false,error:"Enter the bank's actual interest amount and posting date"};
 return db.$transaction(async tx=>{
  const card=await tx.creditCard.findFirst({where:{id:cardId,userId},include:{account:true}});
  if(!card||card.account.accountType!=="CREDIT_CARD")return {ok:false,error:"Credit card not found"};
  const statementDate=nextStatementDate(input.statementDate,card.statementDay);
  if(statementDate.toISOString().slice(0,10)!==input.statementDate.toISOString().slice(0,10))return {ok:false,error:"Choose this card's statement cutoff date"};
  const lock=`${userId}:card-interest:${cardId}:${statementDate.toISOString()}`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lock}))`;
  const existing=await tx.transaction.findMany({where:{userId,accountId:card.accountId,cardInterestStatementDate:statementDate}});
  if(existing.length)return existing.length===1&&existing[0].type==="EXPENSE"&&existing[0].amount===-input.amount&&existing[0].date.getTime()===input.date.getTime()?{ok:true,transactionId:existing[0].id}:{ok:false,error:"Interest is already recorded for this statement. Review the existing transaction instead of adding another charge."};
  const plans=await tx.cyclePaymentPlan.findMany({where:{userId,sourceType:"CREDIT_CARD",sourceId:cardId,statementDate}});
  if(plans.some(p=>p.statementAmount!==null&&p.dueDateStatus==="CONFIRMED"))return {ok:false,error:"This confirmed statement may already include interest in its saved balance. Review it before adding another charge."};
  const created=await createExpenseLikeTransaction(tx,userId,cycleStartDay,{type:"EXPENSE",amount:input.amount,date:input.date,accountId:card.accountId,description:`Bank-confirmed card interest · ${statementDate.toISOString().slice(0,10)}`});
  const row=await tx.transaction.update({where:{id:created.id},data:{cardInterestStatementDate:statementDate}});
  await recordAudit(tx,{userId,entityType:"TRANSACTION",entityId:row.id,action:"CREATE",source:"FORM",newValues:{rows:[row]}});
  return {ok:true,transactionId:row.id};
 });
}
