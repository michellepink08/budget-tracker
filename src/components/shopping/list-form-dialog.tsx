"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { createListAction } from "@/actions/shopping-list.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

type CategoryOption = { id: string; name: string };

type FormValues = {
  name: string;
  plannedDate: string;
  budgetCategoryId: string;
};

export function ListFormDialog({ categories }: { categories: CategoryOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<FormValues>({
    defaultValues: { name: "", plannedDate: "", budgetCategoryId: "" },
  });

  async function onSubmit(values: FormValues) {
    const formData = new FormData();
    formData.set("name", values.name);
    formData.set("plannedDate", values.plannedDate);
    formData.set("budgetCategoryId", values.budgetCategoryId);

    const result = await createListAction(formData);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("List created");
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>New list</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New shopping list</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Name</Label>
            <Input id="name" placeholder="e.g. Weekly groceries" {...register("name")} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="plannedDate">Planned date (optional)</Label>
            <Input id="plannedDate" type="date" {...register("plannedDate")} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="budgetCategoryId">Compare against a budget category (optional)</Label>
            <select
              id="budgetCategoryId"
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
              {...register("budgetCategoryId")}
            >
              <option value="">None</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              When set, this list shows how much of that category&apos;s remaining budget is left after this trip.
            </p>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
