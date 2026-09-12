import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { listCategories } from "@/lib/categories";
import { CategoryFormDialog } from "@/components/categories/category-form-dialog";
import { CategoryList } from "@/components/categories/category-list";

export default async function CategoriesPage() {
  const session = await auth();
  const userId = session!.user.id;

  const categories = await listCategories(prisma, userId);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Categories</h1>
        <CategoryFormDialog />
      </div>
      <CategoryList categories={categories} />
    </div>
  );
}
