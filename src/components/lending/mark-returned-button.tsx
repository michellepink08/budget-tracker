"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { markLendingReturnedAction } from "@/actions/lending.actions";
import { Button } from "@/components/ui/button";

export function MarkReturnedButton({ lendingId }: { lendingId: string }) {
  const router = useRouter();

  async function handleClick() {
    const result = await markLendingReturnedAction(lendingId);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Marked as returned");
    router.refresh();
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={handleClick}>
      Mark as returned
    </Button>
  );
}
