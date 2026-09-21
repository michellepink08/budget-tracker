"use client";
import {useState} from "react";
import {useRouter} from "next/navigation";
import {toast} from "sonner";
import {clearTierraAltaPaymentAction} from "@/actions/tierra-alta.actions";
import {Dialog,DialogContent,DialogTitle,DialogTrigger} from "@/components/ui/dialog";
import {Button} from "@/components/ui/button";
import {formatMoney} from "@/lib/money";
export function ClearReservedPaymentDialog({id,name,amount,currency,accountName,matches}:{id:string;name:string;amount:number;currency:string;accountName:string;matches:{id:string;date:Date;description:string}[]}){
 const router=useRouter();const [open,setOpen]=useState(false);const [pending,setPending]=useState(false);
 async function confirm(fd:FormData){
  if(pending)return;setPending(true);
  try{const result=await clearTierraAltaPaymentAction(id,fd);if(!result.ok){toast.error(result.error);return}toast.success("Cheque marked cleared and paid");setOpen(false);router.refresh()}
  catch{toast.error("Could not confirm clearance. Please try again.")}
  finally{setPending(false)}
 }
 return <Dialog open={open} onOpenChange={setOpen}><DialogTrigger render={<Button size="sm"/>}>Mark cleared &amp; paid</DialogTrigger><DialogContent><DialogTitle>Confirm cheque clearance</DialogTitle><p>{name} · {formatMoney(amount,currency)} from {accountName}</p><form action={confirm} className="flex flex-col gap-4"><label className="flex flex-col gap-2">Cleared date<input required name="date" type="date" defaultValue={new Date().toISOString().slice(0,10)} className="h-10 rounded border bg-input px-3 text-foreground"/></label><label className="flex flex-col gap-2">Payment record<select name="transactionId" defaultValue={matches[0]?.id??""} className="h-10 rounded border bg-input px-3 text-foreground"><option value="">Record a new cleared payment</option>{matches.map(t=><option key={t.id} value={t.id}>Link existing: {t.date.toLocaleDateString("en-PH",{timeZone:"Asia/Manila"})} · {t.description}</option>)}</select></label><p className="text-xs text-muted-foreground">Link a payment already entered in Transactions to avoid a second deduction. A new payment reduces cash only once.</p><Button disabled={pending} type="submit">{pending?"Confirming…":"Confirm cleared & paid"}</Button></form></DialogContent></Dialog>;
}
