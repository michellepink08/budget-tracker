"use client";

import { useRef } from "react";
import { toast } from "sonner";
import { createSubcategoryAction } from "@/actions/category.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function SubcategoryForm({ categoryId }: { categoryId: string }) {
  const formRef = useRef<HTMLFormElement>(null);

  async function action(formData: FormData) {
    const result = await createSubcategoryAction(formData);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    formRef.current?.reset();
  }

  return (
    <form ref={formRef} action={action} className="flex gap-2">
      <input type="hidden" name="categoryId" value={categoryId} />
      <Input name="name" placeholder="Add subcategory" className="h-8 text-sm" />
      <Button type="submit" variant="outline" size="sm">
        Add
      </Button>
    </form>
  );
}
