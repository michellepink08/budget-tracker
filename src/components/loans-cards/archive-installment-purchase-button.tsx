"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { archiveInstallmentPurchaseAction } from "@/actions/installment-purchase.actions";
import { Button } from "@/components/ui/button";

export function ArchiveInstallmentPurchaseButton({ purchaseId }: { purchaseId: string }) {
  const router = useRouter();

  async function handleClick() {
    const result = await archiveInstallmentPurchaseAction(purchaseId);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Installment purchase archived");
    router.refresh();
  }

  return (
    <Button type="button" variant="ghost" onClick={handleClick}>
      Archive
    </Button>
  );
}
