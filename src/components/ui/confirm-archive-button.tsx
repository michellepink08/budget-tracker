"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
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

type ArchiveResult = { ok: true } | { ok: false; error: string };

export function ConfirmArchiveButton({
  title,
  description,
  successMessage,
  onArchive,
}: {
  title: string;
  description: string;
  successMessage: string;
  onArchive: () => Promise<ArchiveResult>;
}) {
  const router = useRouter();

  async function handleConfirm() {
    const result = await onArchive();
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(successMessage);
    router.refresh();
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button type="button" variant="ghost" />}>Archive</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm}>Archive</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
