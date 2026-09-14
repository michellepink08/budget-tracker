"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { archiveSubcategoryAction } from "@/actions/category.actions";
import { Button } from "@/components/ui/button";

export function ArchiveSubcategoryButton({ subcategoryId }: { subcategoryId: string }) {
  const router = useRouter();

  async function handleClick() {
    const result = await archiveSubcategoryAction(subcategoryId);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Subcategory archived");
    router.refresh();
  }

  return (
    <Button type="button" variant="ghost" size="sm" onClick={handleClick}>
      Archive
    </Button>
  );
}
