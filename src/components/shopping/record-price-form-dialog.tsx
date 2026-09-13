"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { recordPriceAction } from "@/actions/shopping-catalog.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

type FormValues = { unitPrice: number; storeName: string };

export function RecordPriceFormDialog({ catalogItemId, currency }: { catalogItemId: string; currency: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<FormValues>({ defaultValues: { unitPrice: 0, storeName: "" } });

  async function onSubmit(values: FormValues) {
    const formData = new FormData();
    formData.set("unitPrice", String(values.unitPrice));
    formData.set("storeName", values.storeName);
    formData.set("source", "MANUAL");

    const result = await recordPriceAction(catalogItemId, currency, formData);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Price recorded");
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="sm" />}>Record price</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record a price</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="unitPrice">Unit price</Label>
            <Input id="unitPrice" type="number" step="0.01" {...register("unitPrice", { valueAsNumber: true })} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="storeName">Store (optional)</Label>
            <Input id="storeName" placeholder="e.g. SM Supermarket" {...register("storeName")} />
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
