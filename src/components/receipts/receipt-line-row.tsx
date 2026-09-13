"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { deleteLineAction, toggleLineExcludedAction, updateLineAction } from "@/actions/receipt.actions";
import { toMajorUnits } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";

type CatalogItemOption = { id: string; canonicalName: string };

type Line = {
  id: string;
  catalogItemId: string | null;
  name: string;
  quantity: number;
  unitPrice: number | null;
  lineTotal: number;
  excluded: boolean;
};

export function ReceiptLineRow({
  line,
  currency,
  catalogItems,
}: {
  line: Line;
  currency: string;
  catalogItems: CatalogItemOption[];
}) {
  const router = useRouter();
  const [name, setName] = useState(line.name);
  const [quantity, setQuantity] = useState(String(line.quantity));
  const [unitPrice, setUnitPrice] = useState(
    line.unitPrice === null ? "" : String(toMajorUnits(line.unitPrice, currency)),
  );
  const [lineTotal, setLineTotal] = useState(String(toMajorUnits(line.lineTotal, currency)));
  const [catalogItemId, setCatalogItemId] = useState(line.catalogItemId ?? "");
  const [isSaving, setIsSaving] = useState(false);

  async function handleSave() {
    setIsSaving(true);
    const formData = new FormData();
    formData.set("catalogItemId", catalogItemId);
    formData.set("name", name);
    formData.set("quantity", quantity);
    formData.set("unitPrice", unitPrice);
    formData.set("lineTotal", lineTotal);
    formData.set("categoryId", "");
    formData.set("excluded", String(line.excluded));
    const result = await updateLineAction(line.id, currency, formData);
    setIsSaving(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Line saved");
    router.refresh();
  }

  async function handleToggleExcluded() {
    const result = await toggleLineExcludedAction(line.id, !line.excluded);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    router.refresh();
  }

  async function handleDelete() {
    const result = await deleteLineAction(line.id);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Line removed");
    router.refresh();
  }

  return (
    <Card className={`flex flex-col gap-2 p-3 ${line.excluded ? "opacity-50" : ""}`}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />
        <select
          className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
          value={catalogItemId}
          onChange={(e) => setCatalogItemId(e.target.value)}
        >
          <option value="">No catalog match</option>
          {catalogItems.map((item) => (
            <option key={item.id} value={item.id}>
              {item.canonicalName}
            </option>
          ))}
        </select>
        <Input type="number" step="0.01" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="Qty" />
        <Input
          type="number"
          step="0.01"
          value={unitPrice}
          onChange={(e) => setUnitPrice(e.target.value)}
          placeholder="Unit price"
        />
        <Input
          type="number"
          step="0.01"
          value={lineTotal}
          onChange={(e) => setLineTotal(e.target.value)}
          placeholder="Line total"
        />
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={handleSave} disabled={isSaving}>
          {isSaving ? "Saving..." : "Save"}
        </Button>
        <Button size="sm" variant="outline" onClick={handleToggleExcluded}>
          {line.excluded ? "Include" : "Exclude"}
        </Button>
        <Button size="sm" variant="ghost" onClick={handleDelete}>
          Delete
        </Button>
      </div>
    </Card>
  );
}
