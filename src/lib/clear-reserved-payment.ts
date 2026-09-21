import type {PrismaClient} from "@prisma/client";
import {createExpenseLikeTransaction} from "./transactions";
import {recordAudit} from "./audit-log";
type Result={ok:true}|{ok:false;error:string};
/** Lock the obligation and selected ledger record; a repeat creates no deduction. */
export async function clearReservedPayment(db:PrismaClient,userId:string,cycleStartDay:number,payableId:string,input:{date:Date;transactionId?:string}):Promise<Result>{
 if(!Number.isFinite(input.date.getTime()))return {ok:false,error:"Choose a valid clearance date"};
 return db.$transaction(async tx=>{
  await tx.$queryRaw`SELECT id FROM "Payable" WHERE id=${payableId} AND "userId"=${userId} FOR UPDATE`;
  const payable=await tx.payable.findFirst({where:{id:payableId,userId}});
  if(!payable)return {ok:false,error:"Payment commitment not found"};
  if(payable.status==="PAID")return !input.transactionId||input.transactionId===payable.paidTransactionId?{ok:true}:{ok:false,error:"This commitment already has a different payment"};
  let transactionId=input.transactionId;
  if(transactionId){
   await tx.$queryRaw`SELECT id FROM "Transaction" WHERE id=${transactionId} AND "userId"=${userId} FOR UPDATE`;
   const transaction=await tx.transaction.findFirst({where:{id:transactionId,userId}});
   if(!transaction||transaction.userId!==userId||transaction.accountId!==payable.accountId||transaction.type!=="EXPENSE"||transaction.status!=="CLEARED"||transaction.amount!==-payable.amount)return {ok:false,error:"Choose a cleared expense from this account for the exact cheque amount"};
   if(await tx.payable.findFirst({where:{userId,paidTransactionId:transactionId,id:{not:payable.id}}}))return {ok:false,error:"This payment is already attached to another commitment"};
  }else{
   // Serialize potentially identical new clearances across separate commitments.
   const lockKey=`${userId}:reserved-payment:${payable.accountId}:${input.date.toISOString().slice(0,10)}`;
   await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
   const start=new Date(input.date.toISOString().slice(0,10));const end=new Date(start.getTime()+86400000);
   const candidates=await tx.transaction.findMany({where:{userId,accountId:payable.accountId,type:"EXPENSE",amount:-payable.amount,description:payable.name,date:{gte:start,lt:end}}});
   if(candidates.length)return {ok:false,error:"A matching transaction already exists. Review and link it instead of creating another payment"};
   const transaction=await createExpenseLikeTransaction(tx,userId,cycleStartDay,{type:"EXPENSE",amount:payable.amount,date:input.date,accountId:payable.accountId,categoryId:payable.categoryId??undefined,description:payable.name});
   transactionId=transaction.id;
  }
  await tx.payable.update({where:{id:payable.id},data:{status:"PAID",paidTransactionId:transactionId}});
  await recordAudit(tx,{userId,entityType:"PAYABLE_PAYMENT",entityId:payable.id,action:"CREATE",source:"FORM",previousValues:{status:"PENDING",paidTransactionId:null},newValues:{status:"PAID",paidTransactionId:transactionId},relatedRecordIds:[transactionId!]});
  return {ok:true};
 });
}
