"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { resetDemoDataAction } from "@/actions/demo.actions";
import { Button } from "@/components/ui/button";

export function DemoDataSettings() {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);

  async function handleReset() {
    setIsPending(true);
    const result = await resetDemoDataAction();
    setIsPending(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Demo data reset");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-muted-foreground">
        This is the shared public demo account. Resetting restores its original fictional accounts,
        categories, and transactions — any changes made while exploring are discarded.
      </p>
      <Button variant="outline" className="w-fit" onClick={handleReset} disabled={isPending}>
        {isPending ? "Resetting..." : "Reset demo data"}
      </Button>
    </div>
  );
}
