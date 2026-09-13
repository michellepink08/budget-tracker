import { describe, expect, it, vi } from "vitest";
import { executeDraft, undoExecution } from "@/lib/quick-capture/execute";
import type { CommandDraft } from "@/lib/quick-capture/types";

function ref(id: string | null, raw = "x") {
  return { raw, id, candidateIds: [] };
}

function makeFakePrisma(overrides: Record<string, any> = {}) {
  const prisma: any = {
    transaction: {
      create: vi.fn().mockResolvedValue({ id: "txn-new" }),
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi
        .fn()
        .mockResolvedValue({ id: "txn-1", type: "EXPENSE", amount: -1000, date: new Date(), description: "old" }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      update: vi.fn().mockResolvedValue({}),
    },
    budgetPeriod: {
      findUnique: vi.fn().mockResolvedValue({ id: "period-1" }),
    },
    account: {
      findFirst: vi.fn().mockResolvedValue({ id: "acc-1" }),
      findUniqueOrThrow: vi.fn().mockResolvedValue({ id: "acc-1", openingBalance: 0 }),
    },
    payable: {
      create: vi.fn().mockResolvedValue({ id: "pay-new" }),
      findFirst: vi.fn().mockResolvedValue({ id: "pay-1", amount: 1000, dueDate: new Date(), notes: "old note" }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    creditCard: { findFirst: vi.fn().mockResolvedValue({ id: "cc-1" }) },
    loan: { findFirst: vi.fn().mockResolvedValue({ id: "loan-1", remainingBalance: 5000, name: "Car loan" }) },
    shoppingList: { findFirst: vi.fn().mockResolvedValue(null), update: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
    shoppingListItem: { create: vi.fn(), findMany: vi.fn().mockResolvedValue([]), update: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() },
    shoppingCatalogItem: { findFirst: vi.fn().mockResolvedValue(null) },
    shoppingPriceHistory: { findFirst: vi.fn().mockResolvedValue(null) },
    yearPlanPhase: { findFirst: vi.fn().mockResolvedValue(null), update: vi.fn(), updateMany: vi.fn() },
    ...overrides,
  };
  prisma.$transaction = overrides.$transaction ?? vi.fn((fn: (tx: unknown) => unknown) => fn(prisma));
  return prisma;
}

const now = new Date(2026, 8, 13);

describe("executeDraft", () => {
  it("creates an expense transaction", async () => {
    const prisma = makeFakePrisma();
    const draft: CommandDraft = {
      intent: "expense",
      amountMinorUnits: 18000,
      account: ref("acc-1"),
      category: null,
      description: "food",
      date: { value: now, confirmed: true },
      cutoffOverride: null,
      clauseText: "x",
      clarification: null,
    };
    const result = await executeDraft(prisma, "user-1", 1, draft);
    expect(result).toEqual({ ok: true, resultingIds: ["txn-new"] });
  });

  it("creates two linked rows plus a fee transaction for a transfer with a fee", async () => {
    const prisma = makeFakePrisma({
      transaction: {
        create: vi
          .fn()
          .mockResolvedValueOnce({ id: "txn-out" })
          .mockResolvedValueOnce({ id: "txn-in" })
          .mockResolvedValueOnce({ id: "txn-fee" }),
        update: vi.fn().mockResolvedValue({}),
      },
      budgetPeriod: { findUnique: vi.fn().mockResolvedValue({ id: "period-1" }) },
    });
    const draft: CommandDraft = {
      intent: "transfer",
      amountMinorUnits: 100000,
      feeMinorUnits: 1500,
      sourceAccount: ref("acc-1"),
      destinationAccount: ref("acc-2"),
      description: "Transfer",
      date: { value: now, confirmed: true },
      cutoffOverride: null,
      clauseText: "x",
      clarification: null,
    };
    const result = await executeDraft(prisma, "user-1", 1, draft);
    expect(result).toEqual({ ok: true, resultingIds: ["txn-out", "txn-in", "txn-fee"] });
  });

  it("records money borrowed by another person as an expense with the person's name in the description", async () => {
    const prisma = makeFakePrisma();
    const draft: CommandDraft = {
      intent: "person_borrowed",
      amountMinorUnits: 50000,
      account: ref("acc-1"),
      personName: "Mama",
      date: { value: now, confirmed: true },
      clauseText: "x",
      clarification: null,
    };
    await executeDraft(prisma, "user-1", 1, draft);
    expect(prisma.transaction.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ description: "Lent to Mama" }) }),
    );
  });

  it("applies a reconciliation and returns the adjustment transaction id", async () => {
    const prisma = makeFakePrisma();
    prisma.account.findUniqueOrThrow.mockResolvedValue({ id: "acc-1", openingBalance: 40000 });
    const draft: CommandDraft = {
      intent: "reconciliation",
      account: ref("acc-1"),
      actualBalanceMinorUnits: 50000,
      date: { value: now, confirmed: true },
      clauseText: "x",
      clarification: null,
    };
    const result = await executeDraft(prisma, "user-1", 1, draft);
    expect(result).toEqual({ ok: true, resultingIds: ["txn-new"] });
  });

  it("creates a payable with dueDateConfirmed carried through", async () => {
    const prisma = makeFakePrisma();
    const draft: CommandDraft = {
      intent: "payable_create",
      name: "EastWest hospital bill",
      amountMinorUnits: 1551914,
      dueDate: { value: now, confirmed: false },
      statementDate: null,
      account: ref("acc-1"),
      category: null,
      notes: null,
      cutoff: null,
      clauseText: "x",
      clarification: null,
    };
    const result = await executeDraft(prisma, "user-1", 1, draft);
    expect(result).toEqual({ ok: true, resultingIds: ["pay-new"] });
    expect(prisma.payable.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ dueDateConfirmed: false }) }),
    );
  });

  it("updates a transaction and returns its previous values for Undo", async () => {
    const prisma = makeFakePrisma();
    const draft: CommandDraft = {
      intent: "transaction_update",
      target: ref("txn-1"),
      amountMinorUnits: 25000,
      date: null,
      description: null,
      clauseText: "x",
      clarification: null,
    };
    const result = await executeDraft(prisma, "user-1", 1, draft);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.resultingIds).toEqual(["txn-1"]);
      expect(result.previousValues).toEqual({ amount: -1000, date: expect.any(Date), description: "old" });
    }
  });

  it("re-signs a corrected amount to match the transaction's existing type, not the raw positive magnitude", async () => {
    const prisma = makeFakePrisma();
    const draft: CommandDraft = {
      intent: "transaction_update",
      target: ref("txn-1"),
      amountMinorUnits: 25000,
      date: null,
      description: null,
      clauseText: "x",
      clarification: null,
    };
    await executeDraft(prisma, "user-1", 1, draft);
    // txn-1's mocked existing row is an EXPENSE (stored negative) — the
    // corrected amount must stay negative, not become +25000.
    expect(prisma.transaction.updateMany).toHaveBeenCalledWith({
      where: { id: "txn-1", userId: "user-1" },
      data: { amount: -25000, date: undefined, description: undefined },
    });
  });

  it("preserves a transfer row's existing sign direction when its amount is corrected", async () => {
    const prisma = makeFakePrisma({
      transaction: {
        create: vi.fn().mockResolvedValue({ id: "txn-new" }),
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi
          .fn()
          .mockResolvedValue({ id: "txn-1", type: "TRANSFER", amount: 5000, date: new Date(), description: "old" }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
        update: vi.fn().mockResolvedValue({}),
      },
    });
    const draft: CommandDraft = {
      intent: "transaction_update",
      target: ref("txn-1"),
      amountMinorUnits: 30000,
      date: null,
      description: null,
      clauseText: "x",
      clarification: null,
    };
    await executeDraft(prisma, "user-1", 1, draft);
    expect(prisma.transaction.updateMany).toHaveBeenCalledWith({
      where: { id: "txn-1", userId: "user-1" },
      data: { amount: 30000, date: undefined, description: undefined },
    });
  });

  it("deletes a transaction with no undo-able ids", async () => {
    const prisma = makeFakePrisma();
    const draft: CommandDraft = {
      intent: "transaction_delete",
      target: ref("txn-1"),
      clauseText: "x",
      clarification: null,
    };
    const result = await executeDraft(prisma, "user-1", 1, draft);
    expect(result).toEqual({ ok: true, resultingIds: [] });
  });

  it("refuses to execute a question draft", async () => {
    const prisma = makeFakePrisma();
    const draft: CommandDraft = {
      intent: "question",
      questionType: "liquid_funds",
      account: null,
      category: null,
      clauseText: "x",
      clarification: null,
    };
    const result = await executeDraft(prisma, "user-1", 1, draft);
    expect(result.ok).toBe(false);
  });

  it("scopes everything to the given userId", async () => {
    const prisma = makeFakePrisma();
    const draft: CommandDraft = {
      intent: "transaction_delete",
      target: ref("txn-1"),
      clauseText: "x",
      clarification: null,
    };
    await executeDraft(prisma, "user-42", 1, draft);
    expect(prisma.transaction.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: "user-42" }) }),
    );
  });
});

describe("undoExecution", () => {
  it("deletes created transaction rows", async () => {
    const prisma = makeFakePrisma();
    const result = await undoExecution(prisma, "user-1", "expense", ["txn-new"], null);
    expect(result).toEqual({ ok: true });
    expect(prisma.transaction.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["txn-new"] }, userId: "user-1" },
    });
  });

  it("restores previous values for a transaction update", async () => {
    const prisma = makeFakePrisma();
    const previousValues = { amount: -1000, date: now, description: "old" };
    const result = await undoExecution(prisma, "user-1", "transaction_update", ["txn-1"], previousValues);
    expect(result).toEqual({ ok: true });
    expect(prisma.transaction.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["txn-1"] }, userId: "user-1" },
      data: previousValues,
    });
  });

  it("is a no-op when there are no resultingIds (e.g. an already-balanced reconciliation, or a delete)", async () => {
    const prisma = makeFakePrisma();
    const result = await undoExecution(prisma, "user-1", "transaction_delete", [], null);
    expect(result).toEqual({ ok: true });
    expect(prisma.transaction.deleteMany).not.toHaveBeenCalled();
  });
});

describe("shopping_schedule", () => {
  it("sets the current list's plannedDate", async () => {
    const prisma = makeFakePrisma({
      shoppingList: {
        findFirst: vi.fn().mockResolvedValue({ id: "list-1", userId: "user-1", plannedDate: null }),
        update: vi.fn().mockResolvedValue({}),
      },
    });

    const result = await executeDraft(prisma, "user-1", 25, {
      intent: "shopping_schedule",
      date: { value: new Date(2026, 8, 19), confirmed: true },
      clauseText: "Schedule grocery shopping for Saturday",
      clarification: null,
    });

    expect(result.ok).toBe(true);
    expect(prisma.shoppingList.update).toHaveBeenCalledWith({
      where: { id: "list-1" },
      data: { plannedDate: new Date(2026, 8, 19) },
    });
  });

  it("reports an error when there's no current list", async () => {
    const prisma = makeFakePrisma({
      shoppingList: { findFirst: vi.fn().mockResolvedValue(null), update: vi.fn() },
    });

    const result = await executeDraft(prisma, "user-1", 25, {
      intent: "shopping_schedule",
      date: { value: new Date(2026, 8, 19), confirmed: true },
      clauseText: "Schedule grocery shopping for Saturday",
      clarification: null,
    });

    expect(result).toEqual({ ok: false, error: "No current shopping list to schedule" });
  });
});

describe("undoExecution — shopping_schedule", () => {
  it("restores the list's previous plannedDate", async () => {
    const prisma = makeFakePrisma({
      shoppingList: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    });

    const result = await undoExecution(
      prisma,
      "user-1",
      "shopping_schedule",
      ["list-1"],
      { plannedDate: null },
    );

    expect(result).toEqual({ ok: true });
    expect(prisma.shoppingList.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["list-1"] }, userId: "user-1" },
      data: { plannedDate: null },
    });
  });
});

describe("shopping_list_add", () => {
  it("adds a catalog-matched item, using its category and latest price", async () => {
    const prisma = makeFakePrisma({
      shoppingList: { findFirst: vi.fn().mockResolvedValue({ id: "list-1", userId: "user-1" }) },
      shoppingListItem: { create: vi.fn().mockResolvedValue({ id: "item-1" }) },
      shoppingCatalogItem: { findFirst: vi.fn().mockResolvedValue({ id: "cat-1", categoryId: "cat-food" }) },
      shoppingPriceHistory: { findFirst: vi.fn().mockResolvedValue({ unitPrice: 5500 }) },
    });

    const result = await executeDraft(prisma, "user-1", 25, {
      intent: "shopping_list_add",
      item: { raw: "rice", id: "cat-1", candidateIds: [] },
      itemNameRaw: "rice",
      clauseText: "Add rice to my shopping list",
      clarification: null,
    });

    expect(result).toEqual({ ok: true, resultingIds: ["item-1"] });
    expect(prisma.shoppingListItem.create).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        listId: "list-1",
        catalogItemId: "cat-1",
        freeTextName: null,
        quantity: 1,
        unit: null,
        estimatedUnitPrice: 5500,
        preferredStoreId: null,
        categoryId: "cat-food",
        priority: "NORMAL",
        notes: null,
      },
    });
  });

  it("adds a free-text item when nothing matched the catalog", async () => {
    const prisma = makeFakePrisma({
      shoppingList: { findFirst: vi.fn().mockResolvedValue({ id: "list-1", userId: "user-1" }) },
      shoppingListItem: { create: vi.fn().mockResolvedValue({ id: "item-1" }) },
    });

    const result = await executeDraft(prisma, "user-1", 25, {
      intent: "shopping_list_add",
      item: { raw: "quail eggs", id: null, candidateIds: [] },
      itemNameRaw: "quail eggs",
      clauseText: "Add quail eggs to my shopping list",
      clarification: null,
    });

    expect(result).toEqual({ ok: true, resultingIds: ["item-1"] });
    expect(prisma.shoppingListItem.create).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        listId: "list-1",
        catalogItemId: null,
        freeTextName: "quail eggs",
        quantity: 1,
        unit: null,
        estimatedUnitPrice: null,
        preferredStoreId: null,
        categoryId: null,
        priority: "NORMAL",
        notes: null,
      },
    });
  });

  it("creates a current list on demand when none exists yet", async () => {
    const prisma = makeFakePrisma({
      shoppingList: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: "list-new" }),
      },
      shoppingListItem: { create: vi.fn().mockResolvedValue({ id: "item-1" }) },
    });

    await executeDraft(prisma, "user-1", 25, {
      intent: "shopping_list_add",
      item: { raw: "rice", id: null, candidateIds: [] },
      itemNameRaw: "rice",
      clauseText: "Add rice to my shopping list",
      clarification: null,
    });

    expect(prisma.shoppingList.create).toHaveBeenCalledWith({
      data: { userId: "user-1", name: "Shopping list", isCurrent: true, plannedDate: null, budgetCategoryId: null },
    });
    expect(prisma.shoppingListItem.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ listId: "list-new" }) }),
    );
  });
});

describe("undoExecution — shopping_list_add", () => {
  it("deletes the created list item", async () => {
    const prisma = makeFakePrisma({
      shoppingListItem: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
    });

    const result = await undoExecution(prisma, "user-1", "shopping_list_add", ["item-1"], null);

    expect(result).toEqual({ ok: true });
    expect(prisma.shoppingListItem.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["item-1"] }, userId: "user-1" },
    });
  });
});

describe("shopping_list_select", () => {
  it("selects the matching item on the current list", async () => {
    const prisma = makeFakePrisma({
      shoppingList: { findFirst: vi.fn().mockResolvedValue({ id: "list-1", userId: "user-1" }) },
      shoppingListItem: {
        findMany: vi.fn().mockResolvedValue([
          { id: "item-1", isSelected: false, freeTextName: null, catalogItem: { canonicalName: "Rice" } },
        ]),
        update: vi.fn().mockResolvedValue({}),
      },
    });

    const result = await executeDraft(prisma, "user-1", 25, {
      intent: "shopping_list_select",
      item: { raw: "rice", id: null, candidateIds: [] },
      clauseText: "Mark rice for the next trip",
      clarification: null,
    });

    expect(result).toEqual({ ok: true, resultingIds: ["item-1"], previousValues: { isSelected: false } });
    expect(prisma.shoppingListItem.update).toHaveBeenCalledWith({
      where: { id: "item-1" },
      data: { isSelected: true },
    });
  });

  it("reports an error when nothing on the current list matches", async () => {
    const prisma = makeFakePrisma({
      shoppingList: { findFirst: vi.fn().mockResolvedValue({ id: "list-1", userId: "user-1" }) },
      shoppingListItem: { findMany: vi.fn().mockResolvedValue([]), update: vi.fn() },
    });

    const result = await executeDraft(prisma, "user-1", 25, {
      intent: "shopping_list_select",
      item: { raw: "durian", id: null, candidateIds: [] },
      clauseText: "Mark durian for the next trip",
      clarification: null,
    });

    expect(result).toEqual({ ok: false, error: "That item isn't on your current shopping list" });
  });
});

describe("undoExecution — shopping_list_select", () => {
  it("restores the item's previous isSelected value", async () => {
    const prisma = makeFakePrisma({
      shoppingListItem: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    });

    const result = await undoExecution(
      prisma,
      "user-1",
      "shopping_list_select",
      ["item-1"],
      { isSelected: false },
    );

    expect(result).toEqual({ ok: true });
    expect(prisma.shoppingListItem.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["item-1"] }, userId: "user-1" },
      data: { isSelected: false },
    });
  });
});
