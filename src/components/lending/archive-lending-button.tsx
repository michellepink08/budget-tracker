"use client";

import { archiveLendingAction } from "@/actions/lending.actions";
import { ConfirmArchiveButton } from "@/components/ui/confirm-archive-button";

export function ArchiveLendingButton({ lendingId, name }: { lendingId: string; name: string }) {
  return (
    <ConfirmArchiveButton
      title={`Archive lending to ${name}?`}
      description="It is hidden from the Lending page. The original loan and any repayments stay in your transactions."
      successMessage="Lending archived"
      onArchive={() => archiveLendingAction(lendingId)}
    />
  );
}
