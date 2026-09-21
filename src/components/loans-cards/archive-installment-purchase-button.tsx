"use client";

import { archiveInstallmentPurchaseAction } from "@/actions/installment-purchase.actions";
import { ConfirmArchiveButton } from "@/components/ui/confirm-archive-button";

export function ArchiveInstallmentPurchaseButton({
  purchaseId,
  name,
  unpaidTerms,
}: {
  purchaseId: string;
  name: string;
  unpaidTerms: number;
}) {
  const warning =
    unpaidTerms > 0
      ? `${unpaidTerms} unpaid ${unpaidTerms === 1 ? "term" : "terms"} will be hidden and stop showing as due. `
      : "";
  return (
    <ConfirmArchiveButton
      title={`Archive "${name}"?`}
      description={`${warning}Payments you already recorded stay in your transactions.`}
      successMessage="Installment purchase archived"
      onArchive={() => archiveInstallmentPurchaseAction(purchaseId)}
    />
  );
}
