"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { addItemAction, updateItemAction } from "@/actions/shopping-list.actions";
import { SHOPPING_ITEM_PRIORITIES } from "@/lib/constants/financial";
import { toMajorUnits } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

type CatalogItemOption = { id: string; canonicalName: string };

type FormValues = {
  catalogItemId: string;
  freeTextName: string;
  quantity: number;
  unit: string;
  estimatedUnitPrice: string;
  storeName: string;
  priority: string;
  notes: string;
};

type ExistingItem = {
  id: string;
  freeTextName: string | null;
  quantity: number;
  unit: string | null;
  estimatedUnitPrice: number | null;
  priority: string;
  notes: string | null;
};

export function ListItemFormDialog({
  listId,
  currency,
  catalogItems,
  existing,
}: {
  listId: string;
  currency: string;
  catalogItems: CatalogItemOption[];
  existing?: ExistingItem;
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
          catalogItemId: "",
          freeTextName: existing.freeTextName ?? "",
          quantity: existing.quantity,
          unit: existing.unit ?? "",
          estimatedUnitPrice:
            existing.estimatedUnitPrice === null ? "" : String(toMajorUnits(existing.estimatedUnitPrice, currency)),
          storeName: "",
          priority: existing.priority,
          notes: existing.notes ?? "",
        }
      : {
          catalogItemId: "",
          freeTextName: "",
          quantity: 1,
          unit: "",
          estimatedUnitPrice: "",
          storeName: "",
          priority: "NORMAL",
          notes: "",
        },
  });

  async function onSubmit(values: FormValues) {
    const formData = new FormData();
    formData.set("catalogItemId", values.catalogItemId);
    formData.set("freeTextName", values.freeTextName);
    formData.set("quantity", String(values.quantity));
    formData.set("unit", values.unit);
    formData.set("estimatedUnitPrice", values.estimatedUnitPrice);
    formData.set("storeName", values.storeName);
    formData.set("priority", values.priority);
    formData.set("notes", values.notes);

    const result = existing
      ? await updateItemAction(existing.id, currency, formData)
      : await addItemAction(listId, currency, formData);
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
        {existing ? "Edit" : "Add item"}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{existing ? "Edit item" : "Add item"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          {!existing && catalogItems.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="catalogItemId">From catalog (optional)</Label>
              <select
                id="catalogItemId"
                className="h-9 rounded-lg border border-input bg-input px-3 text-sm shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)] hover:border-ring/50 dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]"
                {...register("catalogItemId")}
              >
                <option value="">None — use the name below</option>
                {catalogItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.canonicalName}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="freeTextName">Name (used if not picked from catalog)</Label>
            <Input id="freeTextName" placeholder="e.g. Milk" {...register("freeTextName")} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="quantity">Quantity</Label>
            <Input id="quantity" type="number" step="0.01" {...register("quantity", { valueAsNumber: true })} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="unit">Unit (optional)</Label>
            <Input id="unit" {...register("unit")} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="estimatedUnitPrice">Estimated unit price (optional)</Label>
            <Input id="estimatedUnitPrice" type="number" step="0.01" {...register("estimatedUnitPrice")} />
            <p className="text-xs text-muted-foreground">
              Leave blank if you don&apos;t know yet — it&apos;ll show as &quot;Missing price&quot; and stay out of
              the running total until priced.
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="storeName">Store (optional)</Label>
            <Input id="storeName" placeholder="e.g. SM Supermarket" {...register("storeName")} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="priority">Priority</Label>
            <select
              id="priority"
              className="h-9 rounded-lg border border-input bg-input px-3 text-sm shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)] hover:border-ring/50 dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]"
              {...register("priority")}
            >
              {SHOPPING_ITEM_PRIORITIES.map((priority) => (
                <option key={priority} value={priority}>
                  {priority}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Input id="notes" {...register("notes")} />
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
