"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { deletePhaseAction } from "@/actions/year-plan.actions";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export function DeletePhaseButton({ phaseId }: { phaseId: string }) {
  const router = useRouter();

  async function handleConfirm() {
    const result = await deletePhaseAction(phaseId);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Phase deleted");
    router.refresh();
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button variant="ghost" size="sm" />}>Delete</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this phase?</AlertDialogTitle>
          <AlertDialogDescription>
            Any income forecasts linked to this phase keep their own data, they just lose the phase link (and its
            expense estimate). This can&apos;t be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm}>Delete</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
