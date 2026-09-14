"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { archiveCategoryAction } from "@/actions/category.actions";
import { Button } from "@/components/ui/button";

export function ArchiveCategoryButton({ categoryId }: { categoryId: string }) {
  const router = useRouter();

  async function handleClick() {
    const result = await archiveCategoryAction(categoryId);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Category archived");
    router.refresh();
  }

  return (
    <Button type="button" variant="ghost" onClick={handleClick}>
      Archive
    </Button>
  );
}
