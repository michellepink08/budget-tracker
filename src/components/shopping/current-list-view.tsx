import { computeEstimatedTotals } from "@/lib/shopping-totals";
import { formatMoney } from "@/lib/money";
import { Card } from "@/components/ui/card";
import { ListItemFormDialog } from "@/components/shopping/list-item-form-dialog";
import { DeleteListItemButton } from "@/components/shopping/delete-list-item-button";
import { ToggleItemCheckbox } from "@/components/shopping/toggle-item-checkbox";
import { MoveUnpurchasedButton } from "@/components/shopping/move-unpurchased-button";

type ListItem = {
  id: string;
  catalogItemId: string | null;
  freeTextName: string | null;
  quantity: number;
  unit: string | null;
  estimatedUnitPrice: number | null;
  priority: string;
  notes: string | null;
  isSelected: boolean;
  isPurchased: boolean;
  catalogItem: { canonicalName: string } | null;
};

export function CurrentListView({
  list,
  items,
  allowance,
  currency,
  catalogItems,
}: {
  list: { id: string; name: string };
  items: ListItem[];
  allowance: number | null;
  currency: string;
  catalogItems: { id: string; canonicalName: string }[];
}) {
  const { estimatedTotal, hasMissingPrice, overBudget } = computeEstimatedTotals({
    items: items.map((item) => ({
      isSelected: item.isSelected,
      quantity: item.quantity,
      estimatedUnitPrice: item.estimatedUnitPrice,
    })),
    allowance,
  });

  return (
    <div className="flex flex-col gap-4">
      <Card variant="highlight" className="p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">{list.name}</p>
          <ListItemFormDialog listId={list.id} currency={currency} catalogItems={catalogItems} />
        </div>
        <p className="text-2xl font-semibold">{formatMoney(estimatedTotal, currency)}</p>
        {hasMissingPrice && <p className="text-sm text-warning">Some selected items are missing a price.</p>}
        {allowance !== null && (
          <p className={`text-sm ${overBudget ? "text-danger" : "text-muted-foreground"}`}>
            {overBudget ? "Over allowance" : "Remaining allowance"}: {formatMoney(allowance - estimatedTotal, currency)}
          </p>
        )}
      </Card>

      {items.length === 0 ? (
        <p className="text-muted-foreground">No items yet. Add one to start this list.</p>
      ) : (
        <>
          {/* Desktop: compact rows */}
          <div className="hidden flex-col gap-2 sm:flex">
            {items.map((item) => (
              <Card key={item.id} className="flex items-center justify-between p-3">
                <div className="flex items-center gap-3">
                  <ToggleItemCheckbox itemId={item.id} field="isSelected" checked={item.isSelected} />
                  <div>
                    <p className={`font-medium ${item.isPurchased ? "line-through text-muted-foreground" : ""}`}>
                      {item.catalogItem?.canonicalName ?? item.freeTextName}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {item.quantity}
                      {item.unit ? ` ${item.unit}` : ""} ·{" "}
                      {item.estimatedUnitPrice === null ? "Missing price" : formatMoney(item.estimatedUnitPrice, currency)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <ToggleItemCheckbox itemId={item.id} field="isPurchased" checked={item.isPurchased} label="Purchased" />
                  <ListItemFormDialog
                    listId={list.id}
                    currency={currency}
                    catalogItems={catalogItems}
                    existing={item}
                  />
                  <DeleteListItemButton itemId={item.id} />
                </div>
              </Card>
            ))}
          </div>

          {/* Mobile: large checkboxes, one card per item */}
          <div className="flex flex-col gap-3 sm:hidden">
            {items.map((item) => (
              <Card key={item.id} className="flex flex-col gap-2 p-4">
                <p className={`text-lg font-medium ${item.isPurchased ? "line-through text-muted-foreground" : ""}`}>
                  {item.catalogItem?.canonicalName ?? item.freeTextName}
                </p>
                <p className="text-sm text-muted-foreground">
                  {item.quantity}
                  {item.unit ? ` ${item.unit}` : ""} ·{" "}
                  {item.estimatedUnitPrice === null ? "Missing price" : formatMoney(item.estimatedUnitPrice, currency)}
                </p>
                <div className="flex items-center gap-4">
                  <ToggleItemCheckbox itemId={item.id} field="isSelected" checked={item.isSelected} label="Selected" large />
                  <ToggleItemCheckbox itemId={item.id} field="isPurchased" checked={item.isPurchased} label="Purchased" large />
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      <MoveUnpurchasedButton listId={list.id} />
    </div>
  );
}
