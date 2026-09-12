"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { payInstallmentTermAction } from "@/actions/installment-purchase.actions";
import { toMajorUnits } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type AccountOption = { id: string; name: string; currency: string };

type DuePayment = {
  id: string;
  termNumber: number;
  amount: number;
  dueDate: Date;
  purchaseName: string;
  numberOfTerms: number;
};

export function DueInstallmentPaymentsBanner({
  payments,
  payingAccounts,
}: {
  payments: DuePayment[];
  payingAccounts: AccountOption[];
}) {
  const router = useRouter();
  const [payingAccountId, setPayingAccountId] = useState(payingAccounts[0]?.id ?? "");

  if (payments.length === 0) {
    return null;
  }

  const currency = payingAccounts.find((a) => a.id === payingAccountId)?.currency ?? "PHP";

  async function handlePay(paymentId: string, formData: FormData) {
    formData.set("accountId", payingAccountId);
    const result = await payInstallmentTermAction(paymentId, formData);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Term paid");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">Installments due</h2>
        <select
          className="h-8 rounded-md border border-input bg-transparent px-2 text-sm"
          value={payingAccountId}
          onChange={(e) => setPayingAccountId(e.target.value)}
        >
          {payingAccounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>
      {payments.map((payment) => (
        <form
          key={payment.id}
          action={(formData) => handlePay(payment.id, formData)}
          className="flex flex-wrap items-center gap-2 rounded-md bg-background p-3"
        >
          <div className="mr-auto">
            <p className="font-medium">
              {payment.purchaseName} — term {payment.termNumber} of {payment.numberOfTerms}
            </p>
            <p className="text-sm text-muted-foreground">due {payment.dueDate.toLocaleDateString()}</p>
          </div>
          <Input
            name="amount"
            type="number"
            step="0.01"
            defaultValue={toMajorUnits(payment.amount, currency)}
            className="w-28"
          />
          <Input name="date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} className="w-40" />
          <Button type="submit" size="sm">
            Pay
          </Button>
        </form>
      ))}
    </div>
  );
}
