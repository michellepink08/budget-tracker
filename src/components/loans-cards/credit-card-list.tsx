import { formatMoney } from "@/lib/money";
import { CreditCardFormDialog } from "@/components/loans-cards/credit-card-form-dialog";
import { CreditCardPaymentDialog } from "@/components/loans-cards/credit-card-payment-dialog";
import { Card } from "@/components/ui/card";
import {CardInterestDialog} from "./card-interest-dialog";

type CreditCardRow = {
  id: string;
  accountId: string;
  creditLimit: number;
  statementDay: number;
  paymentDueDay: number;
  interestRate: number;
  monthlyInterestEstimate?:number;
  nextStatement?:{statementDate:Date;dueDate:Date|null;principal:number;estimatedInterest:number;confirmedInterest:number;expected:number;dueDateStatus:string};
  totalLiability?:number;
  statementSummary?:{statementAmount:number|null;statementRemaining:number|null;unbilled:number|null};
  statementIsExpected?:boolean;
  plannedPayment?:number|null;
  paidAmount?:number;
  plannedDueDate?:Date|null;
  dueDateStatus?:string;
  account: { name: string; currency: string; balance: number };
};

export function CreditCardList({
  cards,
  linkableAccounts,
  payingAccounts,
}: {
  cards: CreditCardRow[];
  linkableAccounts: { id: string; name: string; currency: string }[];
  payingAccounts: { id: string; name: string; currency: string }[];
}) {
  if (cards.length === 0) {
    return <p className="text-muted-foreground">No credit cards yet.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {cards.map((card) => (
        <Card key={card.id} className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="font-medium">{card.account.name}</p>
            <p className="text-sm text-muted-foreground">
              Available credit {formatMoney(card.account.balance, card.account.currency)} of{" "}
              {formatMoney(card.creditLimit, card.account.currency)} limit · statement day{" "}
              {card.statementDay} · due {card.plannedDueDate?card.plannedDueDate.toLocaleDateString("en-PH",{timeZone:"Asia/Manila"}):"Unconfirmed"}{card.dueDateStatus==="ESTIMATED"?" (estimated)":""} · {card.interestRate}% APR
            </p>
            {card.totalLiability!==undefined&&<p className="text-sm text-muted-foreground">Total outstanding: {formatMoney(card.totalLiability,card.account.currency)}</p>}
            {card.statementSummary&&<p className="text-sm text-muted-foreground">{card.statementIsExpected?"Expected statement":"Statement"}: {card.statementSummary.statementAmount===null?"Not recorded":formatMoney(card.statementSummary.statementAmount,card.account.currency)} · Statement remaining: {card.statementSummary.statementRemaining===null?"Not recorded":formatMoney(card.statementSummary.statementRemaining,card.account.currency)} · Unbilled: {card.statementSummary.unbilled===null?"Not fully verified":formatMoney(card.statementSummary.unbilled,card.account.currency)}</p>}
            {card.plannedPayment!==null&&card.plannedPayment!==undefined&&<p className="text-sm text-muted-foreground">Planned payment: {formatMoney(card.plannedPayment,card.account.currency)} · Paid: {formatMoney(card.paidAmount??0,card.account.currency)} · Remaining: {formatMoney(Math.max(0,card.plannedPayment-(card.paidAmount??0)),card.account.currency)}</p>}
            {card.nextStatement&&<div className="mt-3 rounded-lg border bg-muted/40 p-3 text-sm"><p className="font-medium">Next automatic statement payable · {card.nextStatement.statementDate.toLocaleDateString("en-PH",{timeZone:"Asia/Manila"})}</p><p>Principal {formatMoney(card.nextStatement.principal,card.account.currency)} · {card.nextStatement.confirmedInterest>0?`Bank interest recorded ${formatMoney(card.nextStatement.confirmedInterest,card.account.currency)} (included in principal)`:`Estimated interest ${formatMoney(card.nextStatement.estimatedInterest,card.account.currency)} (${card.monthlyInterestEstimate??3}% monthly)`}</p><p>Expected payable {formatMoney(card.nextStatement.expected,card.account.currency)} · {card.nextStatement.dueDate?`Payment due ${card.nextStatement.dueDate.toLocaleDateString("en-PH",{timeZone:"Asia/Manila"})}${card.nextStatement.dueDateStatus==="ESTIMATED"?" (estimated)":""}`:"Needs a due date"}</p><p className="mt-1 text-xs text-muted-foreground">Includes unpaid principal and new charges through the cutoff. Estimated interest does not change your balance. Use Record bank interest to replace the estimate when the bank posts the actual charge.</p></div>}
          </div>
          <div className="flex flex-wrap gap-2">
            <CreditCardPaymentDialog creditCardId={card.id} payingAccounts={payingAccounts} />
            {card.nextStatement&&<CardInterestDialog cardId={card.id} statementDate={card.nextStatement.statementDate} estimate={card.nextStatement.estimatedInterest} currency={card.account.currency}/>}
            <CreditCardFormDialog linkableAccounts={linkableAccounts} existing={card} />
          </div>
        </Card>
      ))}
    </div>
  );
}
