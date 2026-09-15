"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updateTransactionAction } from "@/actions/transaction.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type CategoryOption = { id: string; name: string; subcategories: { id: string; name: string }[] };

type FormValues = {
  description: string;
  notes: string;
  categoryId: string;
  subcategoryId: string;
};

export function EditTransactionButton({
  transactionId,
  description,
  notes,
  categoryId,
  subcategoryId,
  categories,
}: {
  transactionId: string;
  description: string;
  notes: string | null;
  categoryId: string | null;
  subcategoryId: string | null;
  categories: CategoryOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { isSubmitting },
  } = useForm<FormValues>({
    defaultValues: {
      description,
      notes: notes ?? "",
      categoryId: categoryId ?? "",
      subcategoryId: subcategoryId ?? "",
    },
  });

  const selectedCategoryId = watch("categoryId");
  const selectedCategory = categories.find((c) => c.id === selectedCategoryId);

  async function onSubmit(values: FormValues) {
    const formData = new FormData();
    formData.set("description", values.description);
    formData.set("notes", values.notes);
    formData.set("categoryId", values.categoryId);
    formData.set("subcategoryId", values.subcategoryId);

    const result = await updateTransactionAction(transactionId, formData);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Transaction updated");
    if (result.warning) toast.warning(result.warning);
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="sm" />}>Edit</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit transaction</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="description">Description (optional)</Label>
            <Input
              id="description"
              placeholder="Leave blank to use the transaction type"
              {...register("description")}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="categoryId">Category</Label>
            <select
              id="categoryId"
              value={selectedCategoryId}
              onChange={(e) => {
                setValue("categoryId", e.target.value);
                setValue("subcategoryId", "");
              }}
              className="h-9 rounded-lg border border-input bg-input px-3 text-sm shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)] hover:border-ring/50 dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]"
            >
              <option value="">None</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {selectedCategory && selectedCategory.subcategories.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="subcategoryId">Subcategory</Label>
              <select
                id="subcategoryId"
                {...register("subcategoryId")}
                className="h-9 rounded-lg border border-input bg-input px-3 text-sm shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)] hover:border-ring/50 dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]"
              >
                <option value="">None</option>
                {selectedCategory.subcategories.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" {...register("notes")} />
          </div>

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
