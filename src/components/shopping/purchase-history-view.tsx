import { formatMoney } from "@/lib/money";
import { Card } from "@/components/ui/card";

type PurchasedItem = {
  id: string;
  freeTextName: string | null;
  quantity: number;
  unit: string | null;
  estimatedUnitPrice: number | null;
  catalogItem: { canonicalName: string } | null;
  list: { name: string };
};

export function PurchaseHistoryView({ items, currency }: { items: PurchasedItem[]; currency: string }) {
  if (items.length === 0) {
    return <p className="text-muted-foreground">No purchases recorded yet.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {items.map((item) => (
        <Card key={item.id} className="flex items-center justify-between p-3">
          <div>
            <p className="font-medium">{item.catalogItem?.canonicalName ?? item.freeTextName}</p>
            <p className="text-sm text-muted-foreground">
              {item.quantity}
              {item.unit ? ` ${item.unit}` : ""} · {item.list.name}
            </p>
          </div>
          <p className="text-sm text-muted-foreground">
            {item.estimatedUnitPrice === null ? "—" : formatMoney(item.estimatedUnitPrice, currency)}
          </p>
        </Card>
      ))}
    </div>
  );
}
