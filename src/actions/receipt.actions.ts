"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  confirmReceiptSchema,
  draftReceiptSchema,
  receiptLineSchema,
  receiptStoreSchema,
  receiptTotalsSchema,
} from "@/lib/validations/receipts";
import {
  addImage,
  addLine,
  confirmReceipt,
  createDraftReceipt,
  deleteLine,
  removeImage,
  runOcrExtraction,
  setReceiptStore,
  updateLine,
} from "@/lib/receipts";
import { getOcrAdapter } from "@/lib/receipts/ocr-adapter";
import { deleteReceiptImage, downloadReceiptImage, uploadReceiptImage } from "@/lib/receipts/storage";
import { getOrCreateStore } from "@/lib/shopping-store";
import { toMinorUnits } from "@/lib/money";
import { assertOwnedAccount } from "@/lib/accounts";
import { assertOwnedCategory } from "@/lib/categories";
import { assertNotDemo, assertUnderDemoCap } from "@/lib/demo-guard";

export type ReceiptActionResult = { ok: true; id: string } | { ok: false; error: string };
export type ReceiptVoidActionResult = { ok: true } | { ok: false; error: string };

export async function createDraftReceiptAction(formData: FormData): Promise<ReceiptActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const parsed = draftReceiptSchema.safeParse({
    storeName: formData.get("storeName") || null,
    purchaseDate: formData.get("purchaseDate") || null,
    receiptNumber: formData.get("receiptNumber") || null,
  });
  if (!parsed.success) return { ok: false, error: "Please check the receipt details" };

  const capResult = await assertUnderDemoCap(
    prisma,
    session.user.id,
    () => prisma.receipt.count({ where: { userId: session.user.id } }),
    100,
  );
  if (capResult) return capResult;

  const storeId = await getOrCreateStore(prisma, session.user.id, parsed.data.storeName);
  const receipt = await createDraftReceipt(prisma, session.user.id, {
    storeId,
    purchaseDate: parsed.data.purchaseDate,
    receiptNumber: parsed.data.receiptNumber,
    rawStoreText: parsed.data.storeName,
  });
  revalidatePath("/shopping");
  return { ok: true, id: receipt.id };
}

export async function uploadReceiptImageAction(receiptId: string, formData: FormData): Promise<ReceiptVoidActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "No file provided" };

  const objectKey = await uploadReceiptImage(session.user.id, receiptId, file);
  const result = await addImage(prisma, session.user.id, receiptId, objectKey);
  if (result.ok) revalidatePath("/shopping");
  return result;
}

export async function removeReceiptImageAction(imageId: string): Promise<ReceiptVoidActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const demoResult = await assertNotDemo(prisma, session.user.id);
  if (demoResult) return demoResult;

  const image = await prisma.receiptImage.findFirst({ where: { id: imageId, userId: session.user.id } });
  if (!image) return { ok: false, error: "Image not found" };

  const result = await removeImage(prisma, session.user.id, imageId);
  if (result.ok) {
    await deleteReceiptImage(image.objectKey);
    revalidatePath("/shopping");
  }
  return result;
}

export async function runOcrExtractionAction(receiptId: string): Promise<ReceiptVoidActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const images = await prisma.receiptImage.findMany({ where: { receiptId, userId: session.user.id } });

  let imageBuffers: Buffer[];
  try {
    imageBuffers = await Promise.all(
      images.map(async (image) => (await downloadReceiptImage(image.objectKey)).buffer),
    );
  } catch {
    return { ok: false, error: "Couldn't download the receipt image(s) for OCR" };
  }

  const adapter = await getOcrAdapter();
  let result: ReceiptVoidActionResult;
  try {
    result = await runOcrExtraction(prisma, session.user.id, receiptId, imageBuffers, adapter);
  } catch {
    return { ok: false, error: "OCR extraction failed — try again" };
  }
  if (result.ok) revalidatePath("/shopping");
  return result;
}

export async function addLineAction(
  receiptId: string,
  currency: string,
  formData: FormData,
): Promise<ReceiptActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const rawUnitPrice = formData.get("unitPrice");
  const parsed = receiptLineSchema.safeParse({
    catalogItemId: formData.get("catalogItemId") || null,
    name: formData.get("name"),
    quantity: Number(formData.get("quantity")),
    unitPrice: rawUnitPrice ? Number(rawUnitPrice) : null,
    lineTotal: Number(formData.get("lineTotal")),
    categoryId: formData.get("categoryId") || null,
    excluded: formData.get("excluded") === "true",
  });
  if (!parsed.success) return { ok: false, error: "Please check the line details" };

  const result = await addLine(prisma, session.user.id, receiptId, {
    ...parsed.data,
    rawText: null,
    unitPrice: parsed.data.unitPrice === null ? null : toMinorUnits(parsed.data.unitPrice, currency),
    lineTotal: toMinorUnits(parsed.data.lineTotal, currency),
  });
  if (result.ok) revalidatePath("/shopping");
  return result;
}

export async function updateLineAction(
  lineId: string,
  currency: string,
  formData: FormData,
): Promise<ReceiptActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const rawUnitPrice = formData.get("unitPrice");
  const parsed = receiptLineSchema.safeParse({
    catalogItemId: formData.get("catalogItemId") || null,
    name: formData.get("name"),
    quantity: Number(formData.get("quantity")),
    unitPrice: rawUnitPrice ? Number(rawUnitPrice) : null,
    lineTotal: Number(formData.get("lineTotal")),
    categoryId: formData.get("categoryId") || null,
    excluded: formData.get("excluded") === "true",
  });
  if (!parsed.success) return { ok: false, error: "Please check the line details" };

  const result = await updateLine(prisma, session.user.id, lineId, {
    ...parsed.data,
    unitPrice: parsed.data.unitPrice === null ? null : toMinorUnits(parsed.data.unitPrice, currency),
    lineTotal: toMinorUnits(parsed.data.lineTotal, currency),
  });
  if (result.ok) revalidatePath("/shopping");
  return result;
}

export async function toggleLineExcludedAction(lineId: string, excluded: boolean): Promise<ReceiptActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const result = await updateLine(prisma, session.user.id, lineId, { excluded });
  if (result.ok) revalidatePath("/shopping");
  return result;
}

export async function deleteLineAction(lineId: string): Promise<ReceiptVoidActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const demoResult = await assertNotDemo(prisma, session.user.id);
  if (demoResult) return demoResult;

  const result = await deleteLine(prisma, session.user.id, lineId);
  if (result.ok) revalidatePath("/shopping");
  return result;
}

export async function updateReceiptStoreAction(
  receiptId: string,
  formData: FormData,
): Promise<ReceiptVoidActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const parsed = receiptStoreSchema.safeParse({ storeName: formData.get("storeName") ?? "" });
  if (!parsed.success) return { ok: false, error: "Please check the store name" };

  const result = await setReceiptStore(prisma, session.user.id, receiptId, parsed.data.storeName);
  if (result.ok) revalidatePath("/shopping");
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

export async function updateReceiptTotalsAction(
  receiptId: string,
  currency: string,
  formData: FormData,
): Promise<ReceiptVoidActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const rawSubtotal = formData.get("subtotal");
  const rawGrandTotal = formData.get("grandTotal");
  const parsed = receiptTotalsSchema.safeParse({
    subtotal: rawSubtotal ? Number(rawSubtotal) : null,
    discount: Number(formData.get("discount") || 0),
    tax: Number(formData.get("tax") || 0),
    fees: Number(formData.get("fees") || 0),
    grandTotal: rawGrandTotal ? Number(rawGrandTotal) : null,
    unitemizedDifference: Number(formData.get("unitemizedDifference") || 0),
  });
  if (!parsed.success) return { ok: false, error: "Please check the totals" };

  const receipt = await prisma.receipt.findFirst({ where: { id: receiptId, userId: session.user.id } });
  if (!receipt) return { ok: false, error: "Receipt not found" };

  await prisma.receipt.update({
    where: { id: receiptId },
    data: {
      subtotal: parsed.data.subtotal === null ? null : toMinorUnits(parsed.data.subtotal, currency),
      discount: toMinorUnits(parsed.data.discount, currency),
      tax: toMinorUnits(parsed.data.tax, currency),
      fees: toMinorUnits(parsed.data.fees, currency),
      grandTotal: parsed.data.grandTotal === null ? null : toMinorUnits(parsed.data.grandTotal, currency),
      unitemizedDifference: toMinorUnits(parsed.data.unitemizedDifference, currency),
    },
  });
  revalidatePath("/shopping");
  return { ok: true };
}

export async function confirmReceiptAction(
  receiptId: string,
  formData: FormData,
): Promise<{ ok: true; transactionId: string } | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.user.id } });

  const parsed = confirmReceiptSchema.safeParse({
    accountId: formData.get("accountId"),
    categoryId: formData.get("categoryId") || null,
    date: formData.get("date"),
  });
  if (!parsed.success) return { ok: false, error: "Please check the account/category/date" };

  if (!(await assertOwnedAccount(prisma, session.user.id, parsed.data.accountId))) {
    return { ok: false, error: "Account not found" };
  }
  if (parsed.data.categoryId && !(await assertOwnedCategory(prisma, session.user.id, parsed.data.categoryId))) {
    return { ok: false, error: "Category not found" };
  }

  const result = await confirmReceipt(prisma, session.user.id, user.cycleStartDay, receiptId, {
    accountId: parsed.data.accountId,
    categoryId: parsed.data.categoryId ?? undefined,
    date: parsed.data.date,
  });

  if (result.ok && user.receiptAutoDeleteImages) {
    const images = await prisma.receiptImage.findMany({ where: { receiptId, userId: session.user.id } });
    for (const image of images) {
      await deleteReceiptImage(image.objectKey);
      await removeImage(prisma, session.user.id, image.id);
    }
  }

  if (result.ok) {
    revalidatePath("/shopping");
    revalidatePath("/transactions");
  }
  return result;
}
