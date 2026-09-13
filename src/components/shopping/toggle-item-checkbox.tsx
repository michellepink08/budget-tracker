"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { toggleSelectedAction, togglePurchasedAction } from "@/actions/shopping-list.actions";

export function ToggleItemCheckbox({
  itemId,
  field,
  checked,
  label,
  large,
}: {
  itemId: string;
  field: "isSelected" | "isPurchased";
  checked: boolean;
  label?: string;
  large?: boolean;
}) {
  const router = useRouter();

  async function handleChange() {
    const result = field === "isSelected" ? await toggleSelectedAction(itemId) : await togglePurchasedAction(itemId);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <label className="flex items-center gap-2">
      <input type="checkbox" checked={checked} onChange={handleChange} className={large ? "size-6" : "size-4"} />
      {label && <span className="text-sm">{label}</span>}
    </label>
  );
}
