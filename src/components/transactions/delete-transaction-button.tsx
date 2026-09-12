"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { deleteTransactionAction } from "@/actions/transaction.actions";
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

export function DeleteTransactionButton({ transactionId }: { transactionId: string }) {
  const router = useRouter();

  async function handleConfirm() {
    const result = await deleteTransactionAction(transactionId);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Transaction deleted");
    router.refresh();
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button variant="ghost" size="sm" />}>Delete</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this transaction?</AlertDialogTitle>
          <AlertDialogDescription>
            This can&apos;t be undone. If this is part of a transfer, both linked
            entries will be deleted together.
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
