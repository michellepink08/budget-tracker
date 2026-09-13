"use client";

import { useState } from "react";
import { toast } from "sonner";
import { updateReceiptAutoDeleteImagesAction } from "@/actions/settings.actions";

export function ReceiptsSettings({ initialAutoDeleteImages }: { initialAutoDeleteImages: boolean }) {
  const [enabled, setEnabled] = useState(initialAutoDeleteImages);

  async function handleChange() {
    const next = !enabled;
    setEnabled(next);
    const result = await updateReceiptAutoDeleteImagesAction(next);
    if (!result.ok) {
      setEnabled(!next);
      toast.error(result.error);
      return;
    }
    toast.success("Setting saved");
  }

  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={enabled} onChange={handleChange} className="size-4" />
      Automatically delete receipt images after confirming
    </label>
  );
}
