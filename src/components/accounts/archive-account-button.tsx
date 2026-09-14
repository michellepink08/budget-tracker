"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { archiveAccountAction } from "@/actions/account.actions";
import { Button } from "@/components/ui/button";

export function ArchiveAccountButton({ accountId }: { accountId: string }) {
  const router = useRouter();

  async function handleClick() {
    const result = await archiveAccountAction(accountId);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Account archived");
    router.refresh();
  }

  return (
    <Button type="button" variant="ghost" onClick={handleClick}>
      Archive
    </Button>
  );
}
