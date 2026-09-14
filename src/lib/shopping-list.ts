import type { PrismaClient } from "@prisma/client";
import { resolveBudgetPeriodForDate } from "@/lib/budget-period";
import { listAllocationsWithActuals } from "@/lib/budget-allocations";
import { assertOwnedCategory } from "@/lib/categories";
import { assertOwnedCatalogItem } from "@/lib/shopping-catalog";

export type ShoppingMutationResult = { ok: true; id: string } | { ok: false; error: string };

type ListPrisma = Pick<PrismaClient, "shoppingList" | "shoppingListItem" | "category" | "shoppingCatalogItem">;

export type CreateListResult = { ok: true; id: string } | { ok: false; error: string };

export async function createList(
  prisma: Pick<PrismaClient, "shoppingList" | "category">,
  userId: string,
  input: { name: string; plannedDate: Date | null; budgetCategoryId: string | null },
): Promise<CreateListResult> {
  if (input.budgetCategoryId && !(await assertOwnedCategory(prisma, userId, input.budgetCategoryId))) {
    return { ok: false, error: "Category not found" };
  }
  const existingCurrent = await prisma.shoppingList.findFirst({ where: { userId, isCurrent: true } });
  const list = await prisma.shoppingList.create({
    data: { userId, ...input, isCurrent: existingCurrent === null },
  });
  return { ok: true, id: list.id };
}

async function assertOwnedList(
  prisma: Pick<PrismaClient, "shoppingList">,
  userId: string,
  listId: string,
): Promise<boolean> {
  const list = await prisma.shoppingList.findFirst({ where: { id: listId, userId } });
  return list !== null;
}

export async function addItem(
  prisma: ListPrisma,
  userId: string,
  listId: string,
  input: {
    catalogItemId: string | null;
    freeTextName: string | null;
    quantity: number;
    unit: string | null;
    estimatedUnitPrice: number | null;
    preferredStoreId: string | null;
    categoryId: string | null;
    priority: string;
    notes: string | null;
  },
): Promise<ShoppingMutationResult> {
  if (!(await assertOwnedList(prisma, userId, listId))) {
    return { ok: false, error: "List not found" };
  }
  if (input.categoryId && !(await assertOwnedCategory(prisma, userId, input.categoryId))) {
    return { ok: false, error: "Category not found" };
  }
  if (input.catalogItemId && !(await assertOwnedCatalogItem(prisma, userId, input.catalogItemId))) {
    return { ok: false, error: "Catalog item not found" };
  }
  const item = await prisma.shoppingListItem.create({ data: { userId, listId, ...input } });
  return { ok: true, id: item.id };
}

async function assertOwnedItem(
  prisma: Pick<PrismaClient, "shoppingListItem">,
  userId: string,
  itemId: string,
): Promise<boolean> {
  const item = await prisma.shoppingListItem.findFirst({ where: { id: itemId, userId } });
  return item !== null;
}

export async function updateItem(
  prisma: Pick<PrismaClient, "shoppingListItem" | "category">,
  userId: string,
  itemId: string,
  input: Partial<{
    quantity: number;
    unit: string | null;
    estimatedUnitPrice: number | null;
    preferredStoreId: string | null;
    categoryId: string | null;
    priority: string;
    notes: string | null;
  }>,
): Promise<ShoppingMutationResult> {
  if (!(await assertOwnedItem(prisma, userId, itemId))) {
    return { ok: false, error: "Item not found" };
  }
  if (input.categoryId && !(await assertOwnedCategory(prisma, userId, input.categoryId))) {
    return { ok: false, error: "Category not found" };
  }
  const item = await prisma.shoppingListItem.update({ where: { id: itemId }, data: input });
  return { ok: true, id: item.id };
}

export async function deleteItem(
  prisma: Pick<PrismaClient, "shoppingListItem">,
  userId: string,
  itemId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await assertOwnedItem(prisma, userId, itemId))) {
    return { ok: false, error: "Item not found" };
  }
  await prisma.shoppingListItem.delete({ where: { id: itemId } });
  return { ok: true };
}

async function toggleBoolean(
  prisma: Pick<PrismaClient, "shoppingListItem">,
  userId: string,
  itemId: string,
  field: "isSelected" | "isPurchased",
): Promise<ShoppingMutationResult> {
  const item = await prisma.shoppingListItem.findFirst({ where: { id: itemId, userId } });
  if (!item) return { ok: false, error: "Item not found" };
  const updated = await prisma.shoppingListItem.update({
    where: { id: itemId },
    data: { [field]: !item[field as keyof typeof item] },
  });
  return { ok: true, id: updated.id };
}

export async function toggleSelected(prisma: Pick<PrismaClient, "shoppingListItem">, userId: string, itemId: string) {
  return toggleBoolean(prisma, userId, itemId, "isSelected");
}

export async function togglePurchased(prisma: Pick<PrismaClient, "shoppingListItem">, userId: string, itemId: string) {
  return toggleBoolean(prisma, userId, itemId, "isPurchased");
}

export async function moveUnpurchasedToNewList(
  prisma: ListPrisma,
  userId: string,
  listId: string,
  newListName: string,
): Promise<{ ok: true; newListId: string } | { ok: false; error: string }> {
  if (!(await assertOwnedList(prisma, userId, listId))) {
    return { ok: false, error: "List not found" };
  }
  await prisma.shoppingList.updateMany({ where: { userId, isCurrent: true }, data: { isCurrent: false } });
  const newList = await prisma.shoppingList.create({
    data: { userId, name: newListName, isCurrent: true },
  });
  await prisma.shoppingListItem.updateMany({
    where: { listId, isPurchased: false },
    data: { listId: newList.id },
  });
  return { ok: true, newListId: newList.id };
}

// Hard-delete, matching the Year Plan convention (a shopping list is
// disposable planning data, not something with its own history worth
// keeping once removed) — deletes the list's items first (no cascade in
// the schema, per this project's standing rule against onDelete: Cascade).
export async function deleteList(
  prisma: ListPrisma,
  userId: string,
  listId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await assertOwnedList(prisma, userId, listId))) {
    return { ok: false, error: "List not found" };
  }
  await prisma.shoppingListItem.deleteMany({ where: { listId } });
  await prisma.shoppingList.delete({ where: { id: listId } });
  return { ok: true };
}

export async function makeListCurrent(
  prisma: Pick<PrismaClient, "shoppingList">,
  userId: string,
  listId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await assertOwnedList(prisma, userId, listId))) {
    return { ok: false, error: "List not found" };
  }
  await prisma.shoppingList.updateMany({ where: { userId, isCurrent: true }, data: { isCurrent: false } });
  await prisma.shoppingList.update({ where: { id: listId }, data: { isCurrent: true } });
  return { ok: true };
}

export async function computeShoppingAllowance(
  prisma: Pick<PrismaClient, "budgetPeriod" | "budgetAllocation" | "transaction">,
  userId: string,
  list: { budgetCategoryId: string | null },
  cycleStartDay: number,
  asOf: Date = new Date(),
): Promise<number | null> {
  if (!list.budgetCategoryId) return null;
  const period = await resolveBudgetPeriodForDate(prisma, userId, asOf, cycleStartDay);
  const allocations = await listAllocationsWithActuals(prisma, userId, period.id);
  const allocation = allocations.find((a) => a.categoryId === list.budgetCategoryId);
  return allocation?.remaining ?? null;
}
