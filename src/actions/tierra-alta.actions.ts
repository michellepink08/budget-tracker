"use server";
import {auth} from "@/auth";
import {prisma} from "@/lib/prisma";
import {revalidatePath} from "next/cache";
import {clearReservedPayment} from "@/lib/clear-reserved-payment";
export async function clearTierraAltaPaymentAction(id:string,fd:FormData){
 const session=await auth();if(!session?.user)return {ok:false as const,error:"Please log in"};
 const user=await prisma.user.findUniqueOrThrow({where:{id:session.user.id}});
 const payable=await prisma.payable.findFirst({where:{id,userId:user.id},include:{account:true}});
 if(!payable||payable.account.purpose!=="RESTRICTED")return {ok:false as const,error:"Reserved payment not found"};
 const result=await clearReservedPayment(prisma,user.id,user.cycleStartDay,id,{date:new Date(String(fd.get("date"))),transactionId:String(fd.get("transactionId")??"")||undefined});
 if(result.ok)for(const path of ["/tierra-alta","/dashboard","/budget","/transactions","/accounts"])revalidatePath(path);
 return result;
}
