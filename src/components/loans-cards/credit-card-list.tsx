import { formatMoney } from "@/lib/money";
import { CreditCardFormDialog } from "@/components/loans-cards/credit-card-form-dialog";
import { CreditCardPaymentDialog } from "@/components/loans-cards/credit-card-payment-dialog";
import { Card } from "@/components/ui/card";

type CreditCardRow = {
  id: string;
  accountId: string;
  creditLimit: number;
  statementDay: number;
  paymentDueDay: number;
  interestRate: number;
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
        <Card key={card.id} className="flex items-center justify-between p-4">
          <div>
            <p className="font-medium">{card.account.name}</p>
            <p className="text-sm text-muted-foreground">
              {formatMoney(card.account.balance, card.account.currency)} of{" "}
              {formatMoney(card.creditLimit, card.account.currency)} limit · statement day{" "}
              {card.statementDay} · due day {card.paymentDueDay} · {card.interestRate}% APR
            </p>
          </div>
          <div className="flex gap-2">
            <CreditCardPaymentDialog creditCardId={card.id} payingAccounts={payingAccounts} />
            <CreditCardFormDialog linkableAccounts={linkableAccounts} existing={card} />
          </div>
        </Card>
      ))}
    </div>
  );
}
