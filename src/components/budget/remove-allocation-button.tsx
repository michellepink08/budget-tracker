"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { deleteAllocationAction } from "@/actions/budget.actions";
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

export function RemoveAllocationButton({ allocationId }: { allocationId: string }) {
  const router = useRouter();

  async function handleConfirm() {
    const result = await deleteAllocationAction(allocationId);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Allocation removed");
    router.refresh();
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button variant="ghost" size="sm" />}>Remove</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove this budget allocation?</AlertDialogTitle>
          <AlertDialogDescription>
            This only removes the budget line for this cutoff — none of your actual transactions or spending
            history for this category are affected.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm}>Remove</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
