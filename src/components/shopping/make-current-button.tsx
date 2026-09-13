"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { makeListCurrentAction } from "@/actions/shopping-list.actions";
import { Button } from "@/components/ui/button";

export function MakeCurrentButton({ listId }: { listId: string }) {
  const router = useRouter();

  async function handleClick() {
    const result = await makeListCurrentAction(listId);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Now the current list");
    router.refresh();
  }

  return (
    <Button variant="outline" size="sm" onClick={handleClick}>
      Make current
    </Button>
  );
}
