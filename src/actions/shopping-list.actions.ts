"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { shoppingListItemSchema, shoppingListSchema } from "@/lib/validations/shopping";
import {
  addItem,
  createList,
  deleteItem,
  deleteList,
  makeListCurrent,
  moveUnpurchasedToNewList,
  toggleSelected,
  togglePurchased,
  updateItem,
} from "@/lib/shopping-list";
import { getOrCreateStore } from "@/lib/shopping-store";
import { toMinorUnits } from "@/lib/money";

export type ShoppingActionResult = { ok: true } | { ok: false; error: string };

export async function createListAction(formData: FormData): Promise<ShoppingActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const rawPlannedDate = formData.get("plannedDate");
  const parsed = shoppingListSchema.safeParse({
    name: formData.get("name"),
    plannedDate: rawPlannedDate ? rawPlannedDate : null,
    budgetCategoryId: formData.get("budgetCategoryId") || null,
  });
  if (!parsed.success) return { ok: false, error: "Please check the list details" };

  const result = await createList(prisma, session.user.id, parsed.data);
  if (!result.ok) return result;
  revalidatePath("/shopping");
  return { ok: true };
}

async function parseItemForm(formData: FormData, currency: string, userId: string) {
  const rawPrice = formData.get("estimatedUnitPrice");
  const parsed = shoppingListItemSchema.safeParse({
    catalogItemId: formData.get("catalogItemId") || null,
    freeTextName: formData.get("freeTextName") || null,
    quantity: Number(formData.get("quantity")),
    unit: formData.get("unit") || null,
    estimatedUnitPrice: rawPrice ? Number(rawPrice) : null,
    storeName: formData.get("storeName") || null,
    categoryId: formData.get("categoryId") || null,
    priority: formData.get("priority") || "NORMAL",
    notes: formData.get("notes") || null,
  });
  if (!parsed.success) return parsed;
  const preferredStoreId = await getOrCreateStore(prisma, userId, parsed.data.storeName);
  return {
    ...parsed,
    data: {
      catalogItemId: parsed.data.catalogItemId,
      freeTextName: parsed.data.freeTextName,
      quantity: parsed.data.quantity,
      unit: parsed.data.unit,
      estimatedUnitPrice:
        parsed.data.estimatedUnitPrice === null ? null : toMinorUnits(parsed.data.estimatedUnitPrice, currency),
      preferredStoreId,
      categoryId: parsed.data.categoryId,
      priority: parsed.data.priority,
      notes: parsed.data.notes,
    },
  };
}

export async function addItemAction(
  listId: string,
  currency: string,
  formData: FormData,
): Promise<ShoppingActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const parsed = await parseItemForm(formData, currency, session.user.id);
  if (!parsed.success) return { ok: false, error: "Please check the item details" };

  const result = await addItem(prisma, session.user.id, listId, parsed.data);
  if (result.ok) revalidatePath("/shopping");
  return result;
}

export async function updateItemAction(
  itemId: string,
  currency: string,
  formData: FormData,
): Promise<ShoppingActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const parsed = await parseItemForm(formData, currency, session.user.id);
  if (!parsed.success) return { ok: false, error: "Please check the item details" };

  const result = await updateItem(prisma, session.user.id, itemId, parsed.data);
  if (result.ok) revalidatePath("/shopping");
  return result;
}

export async function deleteItemAction(itemId: string): Promise<ShoppingActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const result = await deleteItem(prisma, session.user.id, itemId);
  if (result.ok) revalidatePath("/shopping");
  return result;
}

export async function toggleSelectedAction(itemId: string): Promise<ShoppingActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const result = await toggleSelected(prisma, session.user.id, itemId);
  if (result.ok) revalidatePath("/shopping");
  return result;
}

export async function togglePurchasedAction(itemId: string): Promise<ShoppingActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const result = await togglePurchased(prisma, session.user.id, itemId);
  if (result.ok) revalidatePath("/shopping");
  return result;
}

export async function moveUnpurchasedToNewListAction(
  listId: string,
  newListName: string,
): Promise<ShoppingActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const result = await moveUnpurchasedToNewList(prisma, session.user.id, listId, newListName);
  if (result.ok) revalidatePath("/shopping");
  return result;
}

export async function deleteListAction(listId: string): Promise<ShoppingActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const result = await deleteList(prisma, session.user.id, listId);
  if (result.ok) revalidatePath("/shopping");
  return result;
}

export async function makeListCurrentAction(listId: string): Promise<ShoppingActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const result = await makeListCurrent(prisma, session.user.id, listId);
  if (result.ok) revalidatePath("/shopping");
  return result;
}
