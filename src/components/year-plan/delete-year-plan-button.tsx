"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { deleteYearPlanAction } from "@/actions/year-plan.actions";
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

export function DeleteYearPlanButton({ yearPlanId }: { yearPlanId: string }) {
  const router = useRouter();

  async function handleConfirm() {
    const result = await deleteYearPlanAction(yearPlanId);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Year Plan deleted");
    router.refresh();
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button variant="ghost" />}>Delete plan</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this Year Plan?</AlertDialogTitle>
          <AlertDialogDescription>
            This deletes the plan along with every phase and income forecast in it. This can&apos;t be undone.
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
