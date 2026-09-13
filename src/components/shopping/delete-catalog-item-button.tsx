"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { archiveCatalogItemAction } from "@/actions/shopping-catalog.actions";
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

// Archives (soft-delete), not a hard delete — a catalog item is referenced
// by historical price rows and past list items that should keep
// displaying correctly. See shopping-catalog.ts's archiveCatalogItem.
export function DeleteCatalogItemButton({ catalogItemId }: { catalogItemId: string }) {
  const router = useRouter();

  async function handleConfirm() {
    const result = await archiveCatalogItemAction(catalogItemId);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Item archived");
    router.refresh();
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button variant="ghost" size="sm" />}>Archive</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Archive this catalog item?</AlertDialogTitle>
          <AlertDialogDescription>
            It won&apos;t show up when adding new items, but its price history and any past list items keep working.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm}>Archive</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
