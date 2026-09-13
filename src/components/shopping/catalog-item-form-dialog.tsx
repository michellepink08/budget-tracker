"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { createCatalogItemAction, updateCatalogItemAction } from "@/actions/shopping-catalog.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

type CategoryOption = { id: string; name: string };

type FormValues = {
  canonicalName: string;
  brand: string;
  size: string;
  unit: string;
  categoryId: string;
  defaultQuantity: number;
  storeName: string;
  aliases: string;
};

type ExistingCatalogItem = {
  id: string;
  canonicalName: string;
  brand: string | null;
  size: string | null;
  unit: string | null;
  categoryId: string | null;
  defaultQuantity: number;
};

export function CatalogItemFormDialog({
  categories,
  existing,
}: {
  categories: CategoryOption[];
  existing?: ExistingCatalogItem;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<FormValues>({
    defaultValues: existing
      ? {
          canonicalName: existing.canonicalName,
          brand: existing.brand ?? "",
          size: existing.size ?? "",
          unit: existing.unit ?? "",
          categoryId: existing.categoryId ?? "",
          defaultQuantity: existing.defaultQuantity,
          storeName: "",
          aliases: "",
        }
      : {
          canonicalName: "",
          brand: "",
          size: "",
          unit: "",
          categoryId: "",
          defaultQuantity: 1,
          storeName: "",
          aliases: "",
        },
  });

  async function onSubmit(values: FormValues) {
    const formData = new FormData();
    formData.set("canonicalName", values.canonicalName);
    formData.set("brand", values.brand);
    formData.set("size", values.size);
    formData.set("unit", values.unit);
    formData.set("categoryId", values.categoryId);
    formData.set("defaultQuantity", String(values.defaultQuantity));
    formData.set("storeName", values.storeName);
    formData.set("aliases", values.aliases);

    const result = existing
      ? await updateCatalogItemAction(existing.id, formData)
      : await createCatalogItemAction(formData);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(existing ? "Item updated" : "Item added");
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant={existing ? "outline" : "default"} size={existing ? "sm" : undefined} />}>
        {existing ? "Edit" : "Add catalog item"}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{existing ? "Edit catalog item" : "Add catalog item"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="canonicalName">Name</Label>
            <Input id="canonicalName" placeholder="e.g. Milk" {...register("canonicalName")} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="brand">Brand (optional)</Label>
            <Input id="brand" {...register("brand")} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="size">Size (optional)</Label>
            <Input id="size" placeholder="e.g. 1L" {...register("size")} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="unit">Unit (optional)</Label>
            <Input id="unit" placeholder="e.g. carton" {...register("unit")} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="categoryId">Category (optional)</Label>
            <select
              id="categoryId"
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
              {...register("categoryId")}
            >
              <option value="">None</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="defaultQuantity">Default quantity</Label>
            <Input
              id="defaultQuantity"
              type="number"
              step="0.01"
              {...register("defaultQuantity", { valueAsNumber: true })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="storeName">Preferred store (optional)</Label>
            <Input id="storeName" placeholder="e.g. SM Supermarket" {...register("storeName")} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="aliases">Other names (optional, comma-separated)</Label>
            <Input id="aliases" placeholder="e.g. fresh milk, gatas" {...register("aliases")} />
            <p className="text-xs text-muted-foreground">
              Helps Quick Capture match this item when you type a different name for it.
            </p>
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
