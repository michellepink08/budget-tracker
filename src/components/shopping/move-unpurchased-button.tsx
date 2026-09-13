"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { moveUnpurchasedToNewListAction } from "@/actions/shopping-list.actions";
import { Button } from "@/components/ui/button";

export function MoveUnpurchasedButton({ listId }: { listId: string }) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);

  async function handleClick() {
    setIsPending(true);
    const name = `List — ${new Date().toLocaleDateString()}`;
    const result = await moveUnpurchasedToNewListAction(listId, name);
    setIsPending(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Unpurchased items moved to a new current list");
    router.refresh();
  }

  return (
    <Button variant="outline" onClick={handleClick} disabled={isPending}>
      {isPending ? "Moving..." : "Move unpurchased to new list"}
    </Button>
  );
}
