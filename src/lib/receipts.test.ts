import { describe, expect, it, vi } from "vitest";
import {
  addImage,
  addLine,
  confirmReceipt,
  createDraftReceipt,
  deleteLine,
  removeImage,
  runOcrExtraction,
  updateLine,
} from "@/lib/receipts";
import type { OcrAdapter } from "@/lib/receipts/ocr-adapter";

function makeFakePrisma(overrides: Record<string, any> = {}) {
  const prisma: any = {
    receipt: {
      create: vi.fn(async ({ data }: any) => ({ id: "receipt-1", ...data })),
      findFirst: vi.fn().mockResolvedValue(null),
      update: vi.fn(async ({ data }: any) => ({ id: "receipt-1", ...data })),
    },
    receiptLine: {
      create: vi.fn(async ({ data }: any) => ({ id: "line-1", ...data })),
      findFirst: vi.fn().mockResolvedValue(null),
      update: vi.fn(async ({ data }: any) => ({ id: "line-1", ...data })),
      delete: vi.fn(async () => ({ id: "line-1" })),
    },
    receiptImage: {
      create: vi.fn(async ({ data }: any) => ({ id: "image-1", ...data })),
      findFirst: vi.fn().mockResolvedValue(null),
      delete: vi.fn(async () => ({ id: "image-1" })),
    },
    shoppingPriceHistory: { create: vi.fn(async ({ data }: any) => ({ id: "price-1", ...data })) },
    transaction: { create: vi.fn(async ({ data }: any) => ({ id: "txn-1", ...data })), findMany: vi.fn() },
    account: { update: vi.fn() },
    budgetPeriod: {
      findUnique: vi.fn().mockResolvedValue({ id: "period-1" }),
      create: vi.fn().mockResolvedValue({ id: "period-1" }),
    },
    auditLog: { create: vi.fn().mockResolvedValue({ id: "audit-1" }) },
    alias: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue({}),
    },
    shoppingCatalogItem: { findMany: vi.fn().mockResolvedValue([]) },
    ...overrides,
  };
  prisma.$transaction = overrides.$transaction ?? vi.fn((fn: (tx: unknown) => unknown) => fn(prisma));
  return prisma;
}

describe("createDraftReceipt", () => {
  it("creates a receipt scoped to the user with status DRAFT", async () => {
    const prisma = makeFakePrisma();
    const receipt = await createDraftReceipt(prisma, "user-1", { storeId: null, purchaseDate: null, receiptNumber: null });
    expect(receipt.id).toBe("receipt-1");
    expect(prisma.receipt.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: "user-1", status: "DRAFT" }),
    });
  });
});

describe("addImage / removeImage", () => {
  it("addImage rejects when the receipt does not belong to the user", async () => {
    const prisma = makeFakePrisma();
    const result = await addImage(prisma, "user-1", "receipt-1", "receipts/user-1/receipt-1/a.jpg");
    expect(result.ok).toBe(false);
  });

  it("addImage creates the image when the receipt belongs to the user", async () => {
    const prisma = makeFakePrisma({
      receipt: { create: vi.fn(), findFirst: vi.fn().mockResolvedValue({ id: "receipt-1", userId: "user-1" }), update: vi.fn() },
    });
    const result = await addImage(prisma, "user-1", "receipt-1", "receipts/user-1/receipt-1/a.jpg");
    expect(result.ok).toBe(true);
  });

  it("removeImage only touches the ReceiptImage row — never the receipt, transaction, or account", async () => {
    const prisma = makeFakePrisma({
      receiptImage: {
        create: vi.fn(),
        findFirst: vi.fn().mockResolvedValue({ id: "image-1", userId: "user-1" }),
        delete: vi.fn(async () => ({ id: "image-1" })),
      },
    });
    const result = await removeImage(prisma, "user-1", "image-1");
    expect(result.ok).toBe(true);
    expect(prisma.receiptImage.delete).toHaveBeenCalledWith({ where: { id: "image-1" } });
    expect(prisma.receipt.update).not.toHaveBeenCalled();
    expect(prisma.transaction.create).not.toHaveBeenCalled();
    expect(prisma.account.update).not.toHaveBeenCalled();
  });

  it("removeImage rejects when the image does not belong to the user", async () => {
    const prisma = makeFakePrisma();
    const result = await removeImage(prisma, "user-1", "image-1");
    expect(result.ok).toBe(false);
    expect(prisma.receiptImage.delete).not.toHaveBeenCalled();
  });
});

describe("addLine / updateLine / deleteLine", () => {
  it("addLine rejects when the receipt does not belong to the user", async () => {
    const prisma = makeFakePrisma();
    const result = await addLine(prisma, "user-1", "receipt-1", {
      catalogItemId: null,
      rawText: null,
      name: "Milk",
      quantity: 1,
      unitPrice: 15000,
      lineTotal: 15000,
      categoryId: null,
      excluded: false,
    });
    expect(result.ok).toBe(false);
  });

  it("addLine creates the line when owned", async () => {
    const prisma = makeFakePrisma({
      receipt: { create: vi.fn(), findFirst: vi.fn().mockResolvedValue({ id: "receipt-1", userId: "user-1" }), update: vi.fn() },
    });
    const result = await addLine(prisma, "user-1", "receipt-1", {
      catalogItemId: null,
      rawText: null,
      name: "Milk",
      quantity: 1,
      unitPrice: 15000,
      lineTotal: 15000,
      categoryId: null,
      excluded: false,
    });
    expect(result.ok).toBe(true);
  });

  it("updateLine rejects when the line does not belong to the user", async () => {
    const prisma = makeFakePrisma();
    const result = await updateLine(prisma, "user-1", "line-1", { name: "Renamed" });
    expect(result.ok).toBe(false);
  });

  it("deleteLine rejects when the line does not belong to the user", async () => {
    const prisma = makeFakePrisma();
    const result = await deleteLine(prisma, "user-1", "line-1");
    expect(result.ok).toBe(false);
    expect(prisma.receiptLine.delete).not.toHaveBeenCalled();
  });

  it("deleteLine deletes when owned", async () => {
    const prisma = makeFakePrisma({
      receiptLine: {
        create: vi.fn(),
        findFirst: vi.fn().mockResolvedValue({ id: "line-1", userId: "user-1" }),
        update: vi.fn(),
        delete: vi.fn(async () => ({ id: "line-1" })),
      },
    });
    const result = await deleteLine(prisma, "user-1", "line-1");
    expect(result.ok).toBe(true);
  });
});

describe("addLine / updateLine — alias learning", () => {
  it("addLine learns a shopping_item alias when given an explicit catalogItemId", async () => {
    const prisma = makeFakePrisma({
      receipt: { create: vi.fn(), findFirst: vi.fn().mockResolvedValue({ id: "receipt-1", userId: "user-1" }), update: vi.fn() },
    });
    await addLine(prisma, "user-1", "receipt-1", {
      catalogItemId: "catalog-1",
      rawText: null,
      name: "Milk",
      quantity: 1,
      unitPrice: 15000,
      lineTotal: 15000,
      categoryId: null,
      excluded: false,
    });
    expect(prisma.alias.upsert).toHaveBeenCalledWith({
      where: { userId_kind_alias: { userId: "user-1", kind: "shopping_item", alias: "milk" } },
      update: { targetId: "catalog-1" },
      create: { userId: "user-1", kind: "shopping_item", alias: "milk", targetId: "catalog-1" },
    });
  });

  it("addLine does not write an alias when left unmatched", async () => {
    const prisma = makeFakePrisma({
      receipt: { create: vi.fn(), findFirst: vi.fn().mockResolvedValue({ id: "receipt-1", userId: "user-1" }), update: vi.fn() },
    });
    await addLine(prisma, "user-1", "receipt-1", {
      catalogItemId: null,
      rawText: null,
      name: "Random one-off item",
      quantity: 1,
      unitPrice: 15000,
      lineTotal: 15000,
      categoryId: null,
      excluded: false,
    });
    expect(prisma.alias.upsert).not.toHaveBeenCalled();
  });

  it("updateLine learns a shopping_item alias when the catalog item is set", async () => {
    const prisma = makeFakePrisma({
      receiptLine: {
        create: vi.fn(),
        findFirst: vi.fn().mockResolvedValue({ id: "line-1", userId: "user-1" }),
        update: vi.fn(async ({ data }: any) => ({ id: "line-1", ...data })),
        delete: vi.fn(),
      },
    });
    await updateLine(prisma, "user-1", "line-1", { catalogItemId: "catalog-2", name: "Bread" });
    expect(prisma.alias.upsert).toHaveBeenCalledWith({
      where: { userId_kind_alias: { userId: "user-1", kind: "shopping_item", alias: "bread" } },
      update: { targetId: "catalog-2" },
      create: { userId: "user-1", kind: "shopping_item", alias: "bread", targetId: "catalog-2" },
    });
  });

  it("addLine resolves catalogItemId from an existing alias when left unmatched", async () => {
    const prisma = makeFakePrisma({
      receipt: { create: vi.fn(), findFirst: vi.fn().mockResolvedValue({ id: "receipt-1", userId: "user-1" }), update: vi.fn() },
      alias: { findUnique: vi.fn().mockResolvedValue({ targetId: "catalog-1" }), upsert: vi.fn().mockResolvedValue({}) },
    });
    const result = await addLine(prisma, "user-1", "receipt-1", {
      catalogItemId: null,
      rawText: null,
      name: "Milk",
      quantity: 1,
      unitPrice: 15000,
      lineTotal: 15000,
      categoryId: null,
      excluded: false,
    });
    expect(result.ok).toBe(true);
    expect(prisma.receiptLine.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ catalogItemId: "catalog-1" }),
    });
  });
});

describe("runOcrExtraction", () => {
  const stubAdapter: OcrAdapter = { extract: vi.fn(async () => ({ lines: [] })) };

  it("with a stub adapter, creates zero lines and marks the receipt REVIEWED", async () => {
    const prisma = makeFakePrisma({
      receipt: { create: vi.fn(), findFirst: vi.fn().mockResolvedValue({ id: "receipt-1", userId: "user-1" }), update: vi.fn(async ({ data }: any) => ({ id: "receipt-1", ...data })) },
    });
    const result = await runOcrExtraction(prisma, "user-1", "receipt-1", [Buffer.from("")], stubAdapter);
    expect(result.ok).toBe(true);
    expect(prisma.receiptLine.create).not.toHaveBeenCalled();
    expect(prisma.receipt.update).toHaveBeenCalledWith({
      where: { id: "receipt-1" },
      data: expect.objectContaining({ status: "REVIEWED" }),
    });
  });

  it("with an adapter that extracts a line, creates exactly one ReceiptLine", async () => {
    const fakeAdapter: OcrAdapter = {
      extract: vi.fn(async () => ({ lines: [{ name: "Milk", quantity: 1, unitPrice: 15000, lineTotal: 15000 }] })),
    };
    const prisma = makeFakePrisma({
      receipt: {
        create: vi.fn(),
        findFirst: vi.fn().mockResolvedValue({ id: "receipt-1", userId: "user-1" }),
        update: vi.fn(async ({ data }: any) => ({ id: "receipt-1", ...data })),
      },
    });
    const result = await runOcrExtraction(prisma, "user-1", "receipt-1", [Buffer.from("")], fakeAdapter);
    expect(result.ok).toBe(true);
    expect(prisma.receiptLine.create).toHaveBeenCalledTimes(1);
  });

  it("with an adapter that extracts a line matching an existing alias, auto-fills the catalog item", async () => {
    const fakeAdapter: OcrAdapter = {
      extract: vi.fn(async () => ({ lines: [{ name: "Milk", quantity: 1, unitPrice: 15000, lineTotal: 15000 }] })),
    };
    const prisma = makeFakePrisma({
      receipt: {
        create: vi.fn(),
        findFirst: vi.fn().mockResolvedValue({ id: "receipt-1", userId: "user-1" }),
        update: vi.fn(async ({ data }: any) => ({ id: "receipt-1", ...data })),
      },
      alias: { findUnique: vi.fn().mockResolvedValue({ targetId: "catalog-1" }), upsert: vi.fn().mockResolvedValue({}) },
    });
    const result = await runOcrExtraction(prisma, "user-1", "receipt-1", [Buffer.from("")], fakeAdapter);
    expect(result.ok).toBe(true);
    expect(prisma.receiptLine.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ catalogItemId: "catalog-1" }),
    });
  });
});

describe("confirmReceipt", () => {
  it("refuses when the receipt does not reconcile, without creating anything", async () => {
    const prisma = makeFakePrisma({
      receipt: {
        create: vi.fn(),
        findFirst: vi.fn().mockResolvedValue({
          id: "receipt-1",
          userId: "user-1",
          storeId: null,
          subtotal: 50000,
          discount: 0,
          tax: 0,
          fees: 0,
          grandTotal: 50000,
          unitemizedDifference: 0,
          lines: [{ id: "line-1", lineTotal: 40000, excluded: false, catalogItemId: null, unitPrice: null }],
        }),
        update: vi.fn(),
      },
    });
    const result = await confirmReceipt(prisma, "user-1", 1, "receipt-1", {
      accountId: "acc-1",
      categoryId: undefined,
      date: new Date(2026, 0, 1),
    });
    expect(result.ok).toBe(false);
    expect(prisma.transaction.create).not.toHaveBeenCalled();
    expect(prisma.receipt.update).not.toHaveBeenCalled();
    expect(prisma.shoppingPriceHistory.create).not.toHaveBeenCalled();
  });

  it("creates exactly one transaction and one price-history row per matched-with-price line, and nothing else balance-affecting", async () => {
    const prisma = makeFakePrisma({
      receipt: {
        create: vi.fn(),
        findFirst: vi.fn().mockResolvedValue({
          id: "receipt-1",
          userId: "user-1",
          storeId: "store-1",
          subtotal: 50000,
          discount: 0,
          tax: 0,
          fees: 0,
          grandTotal: 50000,
          unitemizedDifference: 0,
          lines: [
            { id: "line-1", lineTotal: 30000, excluded: false, catalogItemId: "cat-item-1", unitPrice: 30000 },
            { id: "line-2", lineTotal: 20000, excluded: false, catalogItemId: null, unitPrice: null }, // one-off, no catalog match
          ],
        }),
        update: vi.fn(async ({ data }: any) => ({ id: "receipt-1", ...data })),
      },
    });
    const result = await confirmReceipt(prisma, "user-1", 1, "receipt-1", {
      accountId: "acc-1",
      categoryId: "cat-1",
      date: new Date(2026, 0, 1),
    });
    expect(result.ok).toBe(true);
    expect(prisma.transaction.create).toHaveBeenCalledTimes(1);
    expect(prisma.shoppingPriceHistory.create).toHaveBeenCalledTimes(1);
    expect(prisma.shoppingPriceHistory.create).toHaveBeenCalledWith({
      data: { userId: "user-1", catalogItemId: "cat-item-1", storeId: "store-1", unitPrice: 30000, source: "RECEIPT" },
    });
    expect(prisma.receipt.update).toHaveBeenCalledWith({
      where: { id: "receipt-1" },
      data: { transactionId: "txn-1", status: "CONFIRMED" },
    });
    expect(prisma.account.update).not.toHaveBeenCalled();
  });

  it("records an audit entry listing the transaction and every price-history row created", async () => {
    const prisma = makeFakePrisma({
      receipt: {
        create: vi.fn(),
        findFirst: vi.fn().mockResolvedValue({
          id: "receipt-1",
          userId: "user-1",
          storeId: "store-1",
          subtotal: 30000,
          discount: 0,
          tax: 0,
          fees: 0,
          grandTotal: 30000,
          unitemizedDifference: 0,
          lines: [{ id: "line-1", lineTotal: 30000, excluded: false, catalogItemId: "cat-item-1", unitPrice: 30000 }],
        }),
        update: vi.fn(async ({ data }: any) => ({ id: "receipt-1", ...data })),
      },
    });

    await confirmReceipt(prisma, "user-1", 1, "receipt-1", {
      accountId: "acc-1",
      categoryId: "cat-1",
      date: new Date(2026, 0, 1),
    });

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-1",
        entityType: "RECEIPT_CONFIRMATION",
        entityId: "receipt-1",
        action: "CREATE",
        source: "RECEIPT",
        relatedRecordIds: ["txn-1", "price-1"],
      }),
    });
  });

  it("excludes excluded lines from price-history writes even if they have a catalog match", async () => {
    const prisma = makeFakePrisma({
      receipt: {
        create: vi.fn(),
        findFirst: vi.fn().mockResolvedValue({
          id: "receipt-1",
          userId: "user-1",
          storeId: null,
          // grandTotal 0 and the only line excluded -> reconciliation's
          // line-total sum is 0 too, so this reconciles at 0 (a receipt
          // that's entirely a non-purchase line, e.g. a void/void-reprint).
          subtotal: 0,
          discount: 0,
          tax: 0,
          fees: 0,
          grandTotal: 0,
          unitemizedDifference: 0,
          lines: [{ id: "line-1", lineTotal: 30000, excluded: true, catalogItemId: "cat-item-1", unitPrice: 30000 }],
        }),
        update: vi.fn(async ({ data }: any) => ({ id: "receipt-1", ...data })),
      },
    });
    const result = await confirmReceipt(prisma, "user-1", 1, "receipt-1", {
      accountId: "acc-1",
      categoryId: undefined,
      date: new Date(2026, 0, 1),
    });
    expect(result.ok).toBe(true);
    expect(prisma.shoppingPriceHistory.create).not.toHaveBeenCalled();
  });
});
