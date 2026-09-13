import { formatMoney } from "@/lib/money";
import { Card } from "@/components/ui/card";
import { CatalogItemFormDialog } from "@/components/shopping/catalog-item-form-dialog";
import { DeleteCatalogItemButton } from "@/components/shopping/delete-catalog-item-button";
import { RecordPriceFormDialog } from "@/components/shopping/record-price-form-dialog";

type CatalogItemRow = {
  id: string;
  canonicalName: string;
  brand: string | null;
  size: string | null;
  unit: string | null;
  categoryId: string | null;
  defaultQuantity: number;
  latestPrice: number | null;
};

export function CatalogView({
  items,
  categories,
  currency,
}: {
  items: CatalogItemRow[];
  categories: { id: string; name: string }[];
  currency: string;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <CatalogItemFormDialog categories={categories} />
      </div>
      {items.length === 0 ? (
        <p className="text-muted-foreground">No catalog items yet.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((item) => (
            <Card key={item.id} className="flex items-center justify-between p-3">
              <div>
                <p className="font-medium">
                  {item.canonicalName}
                  {item.brand ? ` (${item.brand})` : ""}
                </p>
                <p className="text-sm text-muted-foreground">
                  {item.size ?? ""} {item.unit ?? ""} ·{" "}
                  {item.latestPrice === null ? "No price recorded" : `Latest: ${formatMoney(item.latestPrice, currency)}`}
                </p>
              </div>
              <div className="flex gap-2">
                <RecordPriceFormDialog catalogItemId={item.id} currency={currency} />
                <CatalogItemFormDialog categories={categories} existing={item} />
                <DeleteCatalogItemButton catalogItemId={item.id} />
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
