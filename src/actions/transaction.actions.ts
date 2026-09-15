"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { transactionSchema, transferSchema } from "@/lib/validations/transaction";
import {
  createExpenseLikeTransaction,
  createTransferTransaction,
  deleteTransaction,
  updateTransaction,
} from "@/lib/transactions";
import { recordAudit } from "@/lib/audit-log";
import { toMinorUnits } from "@/lib/money";
import { assertOwnedAccount } from "@/lib/accounts";
import { assertOwnedCategory, assertOwnedSubcategory, resolveOrCreateCategory } from "@/lib/categories";
import { assertNotDemo, assertUnderDemoCap } from "@/lib/demo-guard";
import { humanizeEnum } from "@/lib/enum-labels";
import { checkOverspendWarning } from "@/lib/overspend-warning";

export type TransactionActionResult =
  | { ok: true; warning?: string }
  | { ok: false; error: string };

async function currentUser() {
  const session = await auth();
  if (!session?.user) return null;
  return prisma.user.findUniqueOrThrow({ where: { id: session.user.id } });
}

export async function createTransactionAction(
  formData: FormData,
): Promise<TransactionActionResult> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "You must be logged in" };

  const parsed = transactionSchema.safeParse({
    type: formData.get("type"),
    amount: Number(formData.get("amount")),
    date: new Date(String(formData.get("date"))),
    accountId: formData.get("accountId"),
    categoryName: formData.get("categoryName") || undefined,
    description: formData.get("description") || undefined,
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) return { ok: false, error: "Please check the transaction details" };

  const capResult = await assertUnderDemoCap(
    prisma,
    user.id,
    () => prisma.transaction.count({ where: { userId: user.id } }),
    100,
  );
  if (capResult) return capResult;

  const account = await assertOwnedAccount(prisma, user.id, parsed.data.accountId);
  if (!account) return { ok: false, error: "Account not found" };

  let categoryId: string | undefined;
  if (parsed.data.categoryName?.trim()) {
    const categoryResult = await resolveOrCreateCategory(
      prisma,
      user.id,
      parsed.data.categoryName,
      parsed.data.type,
    );
    if (!categoryResult.ok) return categoryResult;
    categoryId = categoryResult.id;
  }

  const input = {
    type: parsed.data.type,
    amount: toMinorUnits(parsed.data.amount, account.currency),
    date: parsed.data.date,
    accountId: parsed.data.accountId,
    description: parsed.data.description,
    notes: parsed.data.notes,
    categoryId,
  };

  const createdTransaction = await prisma.$transaction(async (tx) => {
    const transaction = await createExpenseLikeTransaction(tx, user.id, user.cycleStartDay, input);
    await recordAudit(tx, {
      userId: user.id,
      entityType: "TRANSACTION",
      entityId: transaction.id,
      action: "CREATE",
      source: "FORM",
      newValues: { rows: [transaction] },
    });
    return transaction;
  });

  const warning = createdTransaction.budgetPeriodId
    ? await checkOverspendWarning(
        prisma,
        user.id,
        createdTransaction.budgetPeriodId,
        createdTransaction.categoryId,
        createdTransaction.subcategoryId,
        user.currency,
      )
    : null;

  revalidatePath("/transactions");
  revalidatePath("/dashboard");
  return { ok: true, ...(warning ? { warning } : {}) };
}

export async function createTransferAction(formData: FormData): Promise<TransactionActionResult> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "You must be logged in" };

  const parsed = transferSchema.safeParse({
    amount: Number(formData.get("amount")),
    date: new Date(String(formData.get("date"))),
    sourceAccountId: formData.get("sourceAccountId"),
    destinationAccountId: formData.get("destinationAccountId"),
    description: formData.get("description") || undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the transfer details" };
  }

  const capResult = await assertUnderDemoCap(
    prisma,
    user.id,
    () => prisma.transaction.count({ where: { userId: user.id } }),
    100,
  );
  if (capResult) return capResult;

  const [source, destination] = await Promise.all([
    assertOwnedAccount(prisma, user.id, parsed.data.sourceAccountId),
    assertOwnedAccount(prisma, user.id, parsed.data.destinationAccountId),
  ]);
  if (!source) return { ok: false, error: "Source account not found" };
  if (!destination) return { ok: false, error: "Destination account not found" };

  if (source.currency !== destination.currency) {
    return { ok: false, error: "Transfers between different currencies aren't supported yet" };
  }

  const input = { ...parsed.data, amount: toMinorUnits(parsed.data.amount, source.currency) };

  await prisma.$transaction(async (tx) => {
    const transfer = await createTransferTransaction(tx, user.id, user.cycleStartDay, input);
    await recordAudit(tx, {
      userId: user.id,
      entityType: "TRANSFER",
      entityId: transfer.outgoingTransactionId,
      action: "CREATE",
      source: "FORM",
      relatedRecordIds: [transfer.incomingTransactionId],
    });
  });

  revalidatePath("/transactions");
  return { ok: true };
}

export async function updateTransactionAction(
  transactionId: string,
  formData: FormData,
): Promise<TransactionActionResult> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "You must be logged in" };

  const before = await prisma.transaction.findFirst({ where: { id: transactionId, userId: user.id } });
  if (!before) return { ok: false, error: "Transaction not found" };

  // A blank description isn't a validation error here either — fall back to
  // the transaction's own type, same as when it was first created.
  const submittedDescription = String(formData.get("description") ?? "").trim();
  const input = {
    description: submittedDescription || humanizeEnum(before.type),
    notes: (formData.get("notes") as string) || undefined,
    categoryId: (formData.get("categoryId") as string) || null,
    subcategoryId: (formData.get("subcategoryId") as string) || null,
  };

  if (input.categoryId && !(await assertOwnedCategory(prisma, user.id, input.categoryId))) {
    return { ok: false, error: "Category not found" };
  }
  if (input.subcategoryId && !(await assertOwnedSubcategory(prisma, user.id, input.subcategoryId))) {
    return { ok: false, error: "Subcategory not found" };
  }

  const result = await prisma.$transaction(async (tx) => {
    const updateResult = await updateTransaction(tx, user.id, transactionId, input);
    if (!updateResult.ok) return updateResult;
    await recordAudit(tx, {
      userId: user.id,
      entityType: "TRANSACTION",
      entityId: transactionId,
      action: "UPDATE",
      source: "FORM",
      previousValues: {
        description: before.description,
        notes: before.notes,
        categoryId: before.categoryId,
        subcategoryId: before.subcategoryId,
      },
      newValues: input,
    });
    return updateResult;
  });

  if (!result.ok) return result;

  const warning = before.budgetPeriodId
    ? await checkOverspendWarning(
        prisma,
        user.id,
        before.budgetPeriodId,
        input.categoryId,
        input.subcategoryId,
        user.currency,
      )
    : null;

  revalidatePath("/transactions");
  revalidatePath("/dashboard");
  return { ok: true, ...(warning ? { warning } : {}) };
}

export async function deleteTransactionAction(
  transactionId: string,
): Promise<TransactionActionResult> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "You must be logged in" };

  const demoResult = await assertNotDemo(prisma, user.id);
  if (demoResult) return demoResult;

  const result = await prisma.$transaction(async (tx) => {
    const deleteResult = await deleteTransaction(tx, user.id, transactionId);
    if (!deleteResult.ok) return deleteResult;
    await recordAudit(tx, {
      userId: user.id,
      entityType: "TRANSACTION",
      entityId: transactionId,
      action: "DELETE",
      source: "FORM",
      previousValues: { rows: deleteResult.deletedRows },
      relatedRecordIds: deleteResult.deletedRows.slice(1).map((r) => r.id as string),
    });
    return deleteResult;
  });

  if (result.ok) revalidatePath("/transactions");
  return { ok: result.ok, ...(result.ok ? {} : { error: result.error }) } as TransactionActionResult;
}
