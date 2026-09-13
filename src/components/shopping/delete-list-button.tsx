"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { deleteListAction } from "@/actions/shopping-list.actions";
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

export function DeleteListButton({ listId }: { listId: string }) {
  const router = useRouter();

  async function handleConfirm() {
    const result = await deleteListAction(listId);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("List deleted");
    router.refresh();
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button variant="ghost" size="sm" />}>Delete</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this list?</AlertDialogTitle>
          <AlertDialogDescription>
            This deletes the list and every item in it. This can&apos;t be undone.
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
