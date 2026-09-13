import type { PrismaClient } from "@prisma/client";
import { createExpenseLikeTransaction } from "@/lib/transactions";
import { recordAudit } from "@/lib/audit-log";
import { computeReconciliation } from "@/lib/receipts/reconciliation";
import type { OcrAdapter } from "@/lib/receipts/ocr-adapter";
import { createAlias, resolveAlias } from "@/lib/aliases";
import { listActiveCatalogItems } from "@/lib/shopping-catalog";

export type ReceiptMutationResult = { ok: true; id: string } | { ok: false; error: string };

export async function createDraftReceipt(
  prisma: Pick<PrismaClient, "receipt">,
  userId: string,
  input: { storeId: string | null; purchaseDate: Date | null; receiptNumber: string | null },
) {
  return prisma.receipt.create({ data: { userId, status: "DRAFT", ...input } });
}

async function assertOwnedReceipt(
  prisma: Pick<PrismaClient, "receipt">,
  userId: string,
  receiptId: string,
): Promise<boolean> {
  const receipt = await prisma.receipt.findFirst({ where: { id: receiptId, userId } });
  return receipt !== null;
}

export async function addImage(
  prisma: Pick<PrismaClient, "receipt" | "receiptImage">,
  userId: string,
  receiptId: string,
  objectKey: string,
): Promise<ReceiptMutationResult> {
  if (!(await assertOwnedReceipt(prisma, userId, receiptId))) {
    return { ok: false, error: "Receipt not found" };
  }
  const image = await prisma.receiptImage.create({ data: { userId, receiptId, objectKey } });
  return { ok: true, id: image.id };
}

// Deliberately touches only ReceiptImage — deleting an image never touches
// the Receipt, ReceiptLine, or the confirmed Transaction (design doc's
// image-lifecycle isolation rule).
export async function removeImage(
  prisma: Pick<PrismaClient, "receiptImage">,
  userId: string,
  imageId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const image = await prisma.receiptImage.findFirst({ where: { id: imageId, userId } });
  if (!image) return { ok: false, error: "Image not found" };
  await prisma.receiptImage.delete({ where: { id: imageId } });
  return { ok: true };
}

export async function addLine(
  prisma: Pick<PrismaClient, "receipt" | "receiptLine" | "alias" | "shoppingCatalogItem">,
  userId: string,
  receiptId: string,
  input: {
    catalogItemId: string | null;
    rawText: string | null;
    name: string;
    quantity: number;
    unitPrice: number | null;
    lineTotal: number;
    categoryId: string | null;
    excluded: boolean;
  },
): Promise<ReceiptMutationResult> {
  if (!(await assertOwnedReceipt(prisma, userId, receiptId))) {
    return { ok: false, error: "Receipt not found" };
  }

  let catalogItemId = input.catalogItemId;
  if (!catalogItemId && input.name.trim()) {
    const activeCatalogItems = await listActiveCatalogItems(prisma, userId);
    const resolved = await resolveAlias(prisma, userId, "shopping_item", input.name, activeCatalogItems);
    if (resolved.status === "resolved") catalogItemId = resolved.id;
  }

  const line = await prisma.receiptLine.create({ data: { userId, receiptId, ...input, catalogItemId } });

  if (input.catalogItemId && input.name.trim()) {
    await createAlias(prisma, userId, { kind: "shopping_item", alias: input.name, targetId: input.catalogItemId });
  }

  return { ok: true, id: line.id };
}

async function assertOwnedLine(
  prisma: Pick<PrismaClient, "receiptLine">,
  userId: string,
  lineId: string,
): Promise<boolean> {
  const line = await prisma.receiptLine.findFirst({ where: { id: lineId, userId } });
  return line !== null;
}

export async function updateLine(
  prisma: Pick<PrismaClient, "receiptLine" | "alias">,
  userId: string,
  lineId: string,
  input: Partial<{
    catalogItemId: string | null;
    name: string;
    quantity: number;
    unitPrice: number | null;
    lineTotal: number;
    categoryId: string | null;
    excluded: boolean;
  }>,
): Promise<ReceiptMutationResult> {
  if (!(await assertOwnedLine(prisma, userId, lineId))) {
    return { ok: false, error: "Line not found" };
  }
  const line = await prisma.receiptLine.update({ where: { id: lineId }, data: input });

  if (input.catalogItemId && input.name?.trim()) {
    await createAlias(prisma, userId, { kind: "shopping_item", alias: input.name, targetId: input.catalogItemId });
  }

  return { ok: true, id: line.id };
}

export async function deleteLine(
  prisma: Pick<PrismaClient, "receiptLine">,
  userId: string,
  lineId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await assertOwnedLine(prisma, userId, lineId))) {
    return { ok: false, error: "Line not found" };
  }
  await prisma.receiptLine.delete({ where: { id: lineId } });
  return { ok: true };
}

// Runs the adapter over every image (the stub returns nothing; a future
// real adapter would return pre-filled lines/totals here), creates one
// ReceiptLine per extracted line, and moves the receipt to REVIEWED so the
// user knows extraction ran (even when — as with the stub — it found
// nothing and the review screen is 100% manual from here).
export async function runOcrExtraction(
  prisma: Pick<PrismaClient, "receipt" | "receiptLine" | "alias" | "shoppingCatalogItem" | "shoppingStore">,
  userId: string,
  receiptId: string,
  imageBuffers: Buffer[],
  adapter: OcrAdapter,
): Promise<ReceiptMutationResult> {
  const receipt = await prisma.receipt.findFirst({ where: { id: receiptId, userId } });
  if (!receipt) return { ok: false, error: "Receipt not found" };

  const activeCatalogItems = await listActiveCatalogItems(prisma, userId);
  const updateData: Record<string, unknown> = { status: "REVIEWED" };
  let storeText: string | undefined;

  for (const buffer of imageBuffers) {
    const result = await adapter.extract(buffer);
    for (const line of result.lines) {
      let catalogItemId: string | null = null;
      if (line.name.trim()) {
        const resolved = await resolveAlias(prisma, userId, "shopping_item", line.name, activeCatalogItems);
        if (resolved.status === "resolved") catalogItemId = resolved.id;
      }
      await prisma.receiptLine.create({
        data: {
          userId,
          receiptId,
          catalogItemId,
          rawText: null,
          name: line.name,
          quantity: line.quantity ?? 1,
          unitPrice: line.unitPrice ?? null,
          lineTotal: line.lineTotal,
          categoryId: null,
          excluded: false,
        },
      });
    }
    if (result.subtotal !== undefined) updateData.subtotal = result.subtotal;
    if (result.tax !== undefined) updateData.tax = result.tax;
    if (result.grandTotal !== undefined) updateData.grandTotal = result.grandTotal;
    // First non-empty store guess wins across multiple images — a later
    // page's OCR pass overwriting an earlier, possibly-better read isn't
    // worth the added complexity here.
    if (storeText === undefined && result.store !== undefined) storeText = result.store;
  }

  if (storeText !== undefined) {
    updateData.rawStoreText = storeText;
    if (!(receipt as { storeId: string | null }).storeId) {
      const stores = await prisma.shoppingStore.findMany({ where: { userId } });
      const resolved = await resolveAlias(
        prisma,
        userId,
        "shopping_store",
        storeText,
        stores.map((s: { id: string; name: string }) => ({ id: s.id, name: s.name })),
      );
      if (resolved.status === "resolved") updateData.storeId = resolved.id;
    }
  }

  const updated = await prisma.receipt.update({ where: { id: receiptId }, data: updateData });
  return { ok: true, id: updated.id };
}

type ConfirmPrisma = Pick<
  PrismaClient,
  "receipt" | "transaction" | "budgetPeriod" | "shoppingPriceHistory" | "auditLog" | "$transaction"
>;

// The one function in this module that touches a balance. Every other
// function here (create/add/update/delete/runOcrExtraction) only ever
// writes Receipt/ReceiptLine/ReceiptImage rows.
export async function confirmReceipt(
  prisma: ConfirmPrisma,
  userId: string,
  cycleStartDay: number,
  receiptId: string,
  input: { accountId: string; categoryId: string | undefined; date: Date },
): Promise<{ ok: true; transactionId: string } | { ok: false; error: string }> {
  const receipt = await prisma.receipt.findFirst({
    where: { id: receiptId, userId },
    include: { lines: true },
  });
  if (!receipt) return { ok: false, error: "Receipt not found" };

  const { reconciled } = computeReconciliation({
    subtotal: receipt.subtotal,
    discount: receipt.discount,
    tax: receipt.tax,
    fees: receipt.fees,
    grandTotal: receipt.grandTotal,
    unitemizedDifference: receipt.unitemizedDifference ?? 0,
    lines: receipt.lines.map((l: { lineTotal: number; excluded: boolean }) => ({
      lineTotal: l.lineTotal,
      excluded: l.excluded,
    })),
  });
  if (!reconciled) return { ok: false, error: "Receipt does not reconcile yet" };

  // The transaction, the receipt status update, and every price-history
  // row happen atomically — a partial failure here must never leave a
  // posted expense with the receipt still DRAFT (which would let it be
  // confirmed a second time and double-post), or a CONFIRMED receipt with
  // no transaction behind it.
  return prisma.$transaction(async (tx) => {
    const transaction = await createExpenseLikeTransaction(tx, userId, cycleStartDay, {
      type: "EXPENSE",
      amount: receipt.grandTotal ?? 0,
      date: input.date,
      accountId: input.accountId,
      categoryId: input.categoryId,
      description: "Receipt purchase",
    });

    await tx.receipt.update({
      where: { id: receiptId },
      data: { transactionId: transaction.id, status: "CONFIRMED" },
    });

    const priceHistoryIds: string[] = [];
    for (const line of receipt.lines as {
      excluded: boolean;
      catalogItemId: string | null;
      unitPrice: number | null;
    }[]) {
      if (line.excluded || !line.catalogItemId || line.unitPrice === null) continue;
      const priceHistory = await tx.shoppingPriceHistory.create({
        data: {
          userId,
          catalogItemId: line.catalogItemId,
          storeId: receipt.storeId,
          unitPrice: line.unitPrice,
          source: "RECEIPT",
        },
      });
      priceHistoryIds.push(priceHistory.id);
    }

    await recordAudit(tx, {
      userId,
      entityType: "RECEIPT_CONFIRMATION",
      entityId: receiptId,
      action: "CREATE",
      source: "RECEIPT",
      previousValues: { status: "DRAFT_OR_REVIEWED", transactionId: null },
      newValues: { status: "CONFIRMED", transactionId: transaction.id },
      relatedRecordIds: [transaction.id, ...priceHistoryIds],
    });

    return { ok: true, transactionId: transaction.id };
  });
}
