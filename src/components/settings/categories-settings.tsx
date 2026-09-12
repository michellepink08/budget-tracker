import { CategoryFormDialog } from "@/components/categories/category-form-dialog";
import { CategoryList } from "@/components/categories/category-list";

type SubcategoryRow = { id: string; name: string };
type CategoryRow = {
  id: string;
  name: string;
  type: string;
  color: string;
  icon: string;
  subcategories: SubcategoryRow[];
};

export function CategoriesSettings({ categories }: { categories: CategoryRow[] }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <CategoryFormDialog />
      </div>
      <CategoryList categories={categories} />
    </div>
  );
}
