"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { archiveLoanAction } from "@/actions/loan.actions";
import { Button } from "@/components/ui/button";

export function ArchiveLoanButton({ loanId }: { loanId: string }) {
  const router = useRouter();

  async function handleClick() {
    const result = await archiveLoanAction(loanId);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Loan archived");
    router.refresh();
  }

  return (
    <Button type="button" variant="ghost" onClick={handleClick}>
      Archive
    </Button>
  );
}
