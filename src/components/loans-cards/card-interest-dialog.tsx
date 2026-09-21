"use client";
import {useState} from "react";
import {useRouter} from "next/navigation";
import {toast} from "sonner";
import {confirmCardInterestAction} from "@/actions/card-interest.actions";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogTrigger,DialogFooter} from "@/components/ui/dialog";
import {toMajorUnits} from "@/lib/money";
export function CardInterestDialog({cardId,statementDate,estimate,currency}:{cardId:string;statementDate:Date;estimate:number;currency:string}){
 const [open,setOpen]=useState(false),[pending,setPending]=useState(false);const router=useRouter();
 async function submit(event:React.FormEvent<HTMLFormElement>){event.preventDefault();if(pending)return;setPending(true);const form=new FormData(event.currentTarget);try{const result=await confirmCardInterestAction(cardId,form);if(!result.ok)toast.error(result.error);else{toast.success("Confirmed interest recorded—estimate replaced");setOpen(false);router.refresh();}}catch{toast.error("Interest could not be recorded. Please try again.");}finally{setPending(false);}}
 return <Dialog open={open} onOpenChange={setOpen}><DialogTrigger render={<Button variant="outline"/>}>Record bank interest</DialogTrigger><DialogContent><DialogHeader><DialogTitle>Record bank-confirmed interest</DialogTitle></DialogHeader><p className="text-sm text-muted-foreground">Only save the actual charge shown by your bank—not an estimate. This adds one expense to the card, does not deduct cash, and replaces the interest estimate for this statement.</p><form onSubmit={submit} className="flex flex-col gap-4"><div><Label htmlFor={`interest-statement-${cardId}`}>Statement cutoff date</Label><Input id={`interest-statement-${cardId}`} name="statementDate" type="date" defaultValue={statementDate.toISOString().slice(0,10)} required/></div><div><Label htmlFor={`interest-date-${cardId}`}>Bank posting date</Label><Input id={`interest-date-${cardId}`} name="date" type="date" defaultValue={new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Manila",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date())} required/></div><div><Label htmlFor={`interest-amount-${cardId}`}>Actual interest amount</Label><Input id={`interest-amount-${cardId}`} name="amount" type="number" min="0.01" step="0.01" defaultValue={toMajorUnits(estimate,currency)||""} required/></div><DialogFooter><Button type="submit" disabled={pending}>{pending?"Recording…":"Confirm actual charge"}</Button></DialogFooter></form></DialogContent></Dialog>;
}
