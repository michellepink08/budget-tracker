import { CategoryFormDialog } from "@/components/categories/category-form-dialog";
import { SubcategoryForm } from "@/components/categories/subcategory-form";
import { archiveCategoryAction, archiveSubcategoryAction } from "@/actions/category.actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type SubcategoryRow = { id: string; name: string };
type CategoryRow = {
  id: string;
  name: string;
  type: string;
  color: string;
  icon: string;
  subcategories: SubcategoryRow[];
};

export function CategoryList({ categories }: { categories: CategoryRow[] }) {
  if (categories.length === 0) {
    return (
      <p className="text-muted-foreground">No categories yet. Add one to start categorizing transactions.</p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {categories.map((category) => (
        <Card key={category.id} className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">{category.name}</p>
              <p className="text-sm text-muted-foreground">{category.type}</p>
            </div>
            <div className="flex gap-2">
              <CategoryFormDialog existing={category} />
              <form
                action={async () => {
                  "use server";
                  await archiveCategoryAction(category.id);
                }}
              >
                <Button type="submit" variant="ghost">
                  Archive
                </Button>
              </form>
            </div>
          </div>

          {category.subcategories.length > 0 && (
            <ul className="mt-3 flex flex-col gap-1 pl-4 text-sm text-muted-foreground">
              {category.subcategories.map((sub) => (
                <li key={sub.id} className="flex items-center justify-between">
                  {sub.name}
                  <form
                    action={async () => {
                      "use server";
                      await archiveSubcategoryAction(sub.id);
                    }}
                  >
                    <Button type="submit" variant="ghost" size="sm">
                      Archive
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-3">
            <SubcategoryForm categoryId={category.id} />
          </div>
        </Card>
      ))}
    </div>
  );
}
