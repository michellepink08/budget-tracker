"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { catalogItemSchema, priceRecordSchema } from "@/lib/validations/shopping";
import { archiveCatalogItem, createCatalogItem, recordPrice, updateCatalogItem } from "@/lib/shopping-catalog";
import { getOrCreateStore } from "@/lib/shopping-store";
import { toMinorUnits } from "@/lib/money";
import { assertNotDemo, assertUnderDemoCap } from "@/lib/demo-guard";

export type ShoppingActionResult = { ok: true } | { ok: false; error: string };

function parseCatalogItemForm(formData: FormData) {
  return catalogItemSchema.safeParse({
    canonicalName: formData.get("canonicalName"),
    brand: formData.get("brand") || null,
    size: formData.get("size") || null,
    unit: formData.get("unit") || null,
    categoryId: formData.get("categoryId") || null,
    defaultQuantity: Number(formData.get("defaultQuantity")),
    storeName: formData.get("storeName") || null,
    aliases: formData.get("aliases") ? String(formData.get("aliases")) : null,
  });
}

export async function createCatalogItemAction(formData: FormData): Promise<ShoppingActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const parsed = parseCatalogItemForm(formData);
  if (!parsed.success) return { ok: false, error: "Please check the item details" };

  const capResult = await assertUnderDemoCap(
    prisma,
    session.user.id,
    () => prisma.shoppingCatalogItem.count({ where: { userId: session.user.id } }),
    100,
  );
  if (capResult) return capResult;

  const preferredStoreId = await getOrCreateStore(prisma, session.user.id, parsed.data.storeName);
  const result = await createCatalogItem(prisma, session.user.id, {
    canonicalName: parsed.data.canonicalName,
    brand: parsed.data.brand,
    size: parsed.data.size,
    unit: parsed.data.unit,
    categoryId: parsed.data.categoryId,
    defaultQuantity: parsed.data.defaultQuantity,
    preferredStoreId,
    aliases: parsed.data.aliases,
  });
  if (!result.ok) return result;
  revalidatePath("/shopping");
  return { ok: true };
}

export async function updateCatalogItemAction(
  catalogItemId: string,
  formData: FormData,
): Promise<ShoppingActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const parsed = parseCatalogItemForm(formData);
  if (!parsed.success) return { ok: false, error: "Please check the item details" };

  const preferredStoreId = await getOrCreateStore(prisma, session.user.id, parsed.data.storeName);
  const result = await updateCatalogItem(prisma, session.user.id, catalogItemId, {
    canonicalName: parsed.data.canonicalName,
    brand: parsed.data.brand,
    size: parsed.data.size,
    unit: parsed.data.unit,
    categoryId: parsed.data.categoryId,
    defaultQuantity: parsed.data.defaultQuantity,
    preferredStoreId,
  });
  if (result.ok) revalidatePath("/shopping");
  return result;
}

export async function archiveCatalogItemAction(catalogItemId: string): Promise<ShoppingActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const demoResult = await assertNotDemo(prisma, session.user.id);
  if (demoResult) return demoResult;

  const result = await archiveCatalogItem(prisma, session.user.id, catalogItemId);
  if (result.ok) revalidatePath("/shopping");
  return result;
}

export async function recordPriceAction(
  catalogItemId: string,
  currency: string,
  formData: FormData,
): Promise<ShoppingActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const parsed = priceRecordSchema.safeParse({
    storeName: formData.get("storeName") || null,
    unitPrice: Number(formData.get("unitPrice")),
    source: formData.get("source") || "MANUAL",
  });
  if (!parsed.success) return { ok: false, error: "Please check the price details" };

  const storeId = await getOrCreateStore(prisma, session.user.id, parsed.data.storeName);
  const result = await recordPrice(prisma, session.user.id, catalogItemId, {
    storeId,
    unitPrice: toMinorUnits(parsed.data.unitPrice, currency),
    source: parsed.data.source,
  });
  if (!result.ok) return result;
  revalidatePath("/shopping");
  return { ok: true };
}
