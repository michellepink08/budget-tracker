"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { toggleRecurringPayableActiveAction } from "@/actions/recurring-payable.actions";
import { Button } from "@/components/ui/button";

export function ToggleRecurringPayableActiveButton({
  ruleId,
  active,
}: {
  ruleId: string;
  active: boolean;
}) {
  const router = useRouter();

  async function handleClick() {
    const result = await toggleRecurringPayableActiveAction(ruleId, !active);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(active ? "Recurring bill deactivated" : "Recurring bill activated");
    router.refresh();
  }

  return (
    <Button type="button" variant="ghost" onClick={handleClick}>
      {active ? "Deactivate" : "Activate"}
    </Button>
  );
}
