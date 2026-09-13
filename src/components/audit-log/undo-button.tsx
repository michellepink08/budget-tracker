"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { undoAuditLogEntryAction } from "@/actions/audit-log.actions";
import { Button } from "@/components/ui/button";

export function UndoButton({ auditLogId }: { auditLogId: string }) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);

  async function handleUndo() {
    setIsPending(true);
    const result = await undoAuditLogEntryAction(auditLogId);
    setIsPending(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Undone");
    router.refresh();
  }

  return (
    <Button size="sm" variant="outline" disabled={isPending} onClick={handleUndo}>
      Undo
    </Button>
  );
}
