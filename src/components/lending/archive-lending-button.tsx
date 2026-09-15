"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { archiveLendingAction } from "@/actions/lending.actions";
import { Button } from "@/components/ui/button";

export function ArchiveLendingButton({ lendingId }: { lendingId: string }) {
  const router = useRouter();

  async function handleClick() {
    const result = await archiveLendingAction(lendingId);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Lending archived");
    router.refresh();
  }

  return (
    <Button type="button" variant="ghost" onClick={handleClick}>
      Archive
    </Button>
  );
}
