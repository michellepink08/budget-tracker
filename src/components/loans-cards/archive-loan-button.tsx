"use client";

import { archiveLoanAction } from "@/actions/loan.actions";
import { ConfirmArchiveButton } from "@/components/ui/confirm-archive-button";

export function ArchiveLoanButton({ loanId, name }: { loanId: string; name: string }) {
  return (
    <ConfirmArchiveButton
      title={`Archive "${name}"?`}
      description="The loan is hidden from Trackers and stops appearing in your plan. Payments you already recorded stay in your transactions."
      successMessage="Loan archived"
      onArchive={() => archiveLoanAction(loanId)}
    />
  );
}
