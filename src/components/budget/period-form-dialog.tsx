"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { createBudgetPeriodAction } from "@/actions/budget.actions";
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

type FormValues = { name: string; startDate: string; endDate: string };

export function PeriodFormDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<FormValues>({ defaultValues: { name: "", startDate: "", endDate: "" } });

  async function onSubmit(values: FormValues) {
    const formData = new FormData();
    formData.set("name", values.name);
    formData.set("startDate", values.startDate);
    formData.set("endDate", values.endDate);

    const result = await createBudgetPeriodAction(formData);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Period created");
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" />}>New period</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a budget period</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Name</Label>
            <Input id="name" {...register("name")} required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="startDate">Start date</Label>
            <Input id="startDate" type="date" {...register("startDate")} required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="endDate">End date</Label>
            <Input id="endDate" type="date" {...register("endDate")} required />
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
