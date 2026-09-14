"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { toggleRecurringRuleActiveAction } from "@/actions/recurring.actions";
import { Button } from "@/components/ui/button";

export function ToggleRuleActiveButton({ ruleId, active }: { ruleId: string; active: boolean }) {
  const router = useRouter();

  async function handleClick() {
    const result = await toggleRecurringRuleActiveAction(ruleId, !active);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(active ? "Rule deactivated" : "Rule activated");
    router.refresh();
  }

  return (
    <Button type="button" variant="ghost" onClick={handleClick}>
      {active ? "Deactivate" : "Activate"}
    </Button>
  );
}
