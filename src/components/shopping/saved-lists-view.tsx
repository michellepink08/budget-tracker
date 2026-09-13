import { Card } from "@/components/ui/card";
import { ListFormDialog } from "@/components/shopping/list-form-dialog";
import { MakeCurrentButton } from "@/components/shopping/make-current-button";
import { DeleteListButton } from "@/components/shopping/delete-list-button";

type SavedList = {
  id: string;
  name: string;
  plannedDate: Date | null;
  itemCount: number;
};

export function SavedListsView({
  lists,
  categories,
}: {
  lists: SavedList[];
  categories: { id: string; name: string }[];
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <ListFormDialog categories={categories} />
      </div>
      {lists.length === 0 ? (
        <p className="text-muted-foreground">No saved lists yet.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {lists.map((list) => (
            <Card key={list.id} className="flex items-center justify-between p-3">
              <div>
                <p className="font-medium">{list.name}</p>
                <p className="text-sm text-muted-foreground">
                  {list.itemCount} item(s){list.plannedDate ? ` · Planned ${list.plannedDate.toLocaleDateString()}` : ""}
                </p>
              </div>
              <div className="flex gap-2">
                <MakeCurrentButton listId={list.id} />
                <DeleteListButton listId={list.id} />
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
