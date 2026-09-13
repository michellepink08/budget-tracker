"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { createReminderAction } from "@/actions/calendar.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

type FormValues = { label: string; date: string; amount: string };

export function ReminderFormDialog({ currency }: { currency: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<FormValues>({
    defaultValues: { label: "", date: new Date().toISOString().slice(0, 10), amount: "" },
  });

  async function onSubmit(values: FormValues) {
    const formData = new FormData();
    formData.set("label", values.label);
    formData.set("date", values.date);
    formData.set("amount", values.amount);
    const result = await createReminderAction(currency, formData);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Reminder added");
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>Add reminder</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add reminder</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="label">Label</Label>
            <Input id="label" placeholder="e.g. Passport renewal" {...register("label")} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="date">Date</Label>
            <Input id="date" type="date" {...register("date")} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="amount">Amount (optional)</Label>
            <Input id="amount" type="number" step="0.01" {...register("amount")} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Adding..." : "Add"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
