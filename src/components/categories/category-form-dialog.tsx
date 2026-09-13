"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { toast } from "sonner";
import { categorySchema } from "@/lib/validations/category";
import { createCategoryAction, updateCategoryAction } from "@/actions/category.actions";
import { CATEGORY_TYPES } from "@/lib/constants/financial";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type CategoryFormValues = z.infer<typeof categorySchema>;

type ExistingCategory = {
  id: string;
  name: string;
  type: string;
  color: string;
  icon: string;
};

export function CategoryFormDialog({ existing }: { existing?: ExistingCategory }) {
  const [open, setOpen] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CategoryFormValues>({
    resolver: zodResolver(categorySchema),
    defaultValues: existing
      ? { name: existing.name, type: existing.type as CategoryFormValues["type"], color: existing.color, icon: existing.icon }
      : { name: "", type: "EXPENSE", color: "coral", icon: "tag" },
  });

  async function onSubmit(values: CategoryFormValues) {
    const formData = new FormData();
    formData.set("name", values.name);
    formData.set("type", values.type);
    formData.set("color", values.color);
    formData.set("icon", values.icon);

    const result = existing
      ? await updateCategoryAction(existing.id, formData)
      : await createCategoryAction(formData);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(existing ? "Category updated" : "Category created");
    setOpen(false);
    if (!existing) reset();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant={existing ? "outline" : "default"} />}>
        {existing ? "Edit" : "Add category"}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{existing ? "Edit category" : "Add category"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Name</Label>
            <Input id="name" {...register("name")} />
            {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="type">Type</Label>
            <select
              id="type"
              className="h-9 rounded-lg border border-input bg-input px-3 text-sm shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)] hover:border-ring/50 dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]"
              {...register("type")}
            >
              {CATEGORY_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>

          <input type="hidden" {...register("color")} />
          <input type="hidden" {...register("icon")} />

          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
