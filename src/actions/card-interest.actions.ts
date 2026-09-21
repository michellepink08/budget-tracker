"use server";
import {auth} from "@/auth";
import {prisma} from "@/lib/prisma";
import {recordConfirmedCardInterest} from "@/lib/card-interest";
import {toMinorUnits} from "@/lib/money";
import {revalidatePath} from "next/cache";
import {z} from "zod";
import {assertNotDemo} from "@/lib/demo-guard";
const schema=z.object({amount:z.coerce.number().positive(),date:z.coerce.date(),statementDate:z.coerce.date()});
export async function confirmCardInterestAction(cardId:string,form:FormData){
 const session=await auth();if(!session?.user)return {ok:false as const,error:"You must be logged in"};
 const demo=await assertNotDemo(prisma,session.user.id);if(demo)return demo;
 const parsed=schema.safeParse({amount:form.get("amount"),date:form.get("date"),statementDate:form.get("statementDate")});
 if(!parsed.success)return {ok:false as const,error:"Enter the bank-confirmed amount, statement date and posting date"};
 const formatter=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Manila",year:"numeric",month:"2-digit",day:"2-digit"});
 if(formatter.format(parsed.data.date)>formatter.format(new Date()))return {ok:false as const,error:"Only record interest that the bank has already posted"};
 const user=await prisma.user.findUniqueOrThrow({where:{id:session.user.id}});
 const card=await prisma.creditCard.findFirst({where:{id:cardId,userId:user.id},include:{account:true}});if(!card)return {ok:false as const,error:"Credit card not found"};
 const result=await recordConfirmedCardInterest(prisma,user.id,user.cycleStartDay,cardId,{...parsed.data,amount:toMinorUnits(parsed.data.amount,card.account.currency)});
 if(result.ok)for(const path of ["/budget","/dashboard","/calendar","/loans-cards","/transactions","/accounts"])revalidatePath(path);
 return result;
}
