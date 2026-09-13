import type { PrismaClient } from "@prisma/client";
import { createExpenseLikeTransaction, createTransferTransaction, updateTransaction, deleteTransaction } from "@/lib/transactions";
import { applyReconciliation } from "@/lib/reconciliation";
import { createPayable, updatePayable } from "@/lib/payables";
import { makeCreditCardPayment } from "@/lib/credit-cards";
import { makeLoanPayment } from "@/lib/loans";
import { signedAmountForType, type SignableTransactionType } from "@/lib/transaction-rules";
import type { CommandDraft } from "@/lib/quick-capture/types";

export type ExecuteResult =
  | { ok: true; resultingIds: string[]; previousValues?: Record<string, unknown> }
  | { ok: false; error: string };

type ExecutePrisma = Pick<
  PrismaClient,
  | "transaction"
  | "budgetPeriod"
  | "account"
  | "payable"
  | "creditCard"
  | "loan"
  | "shoppingList"
  | "shoppingListItem"
  | "shoppingCatalogItem"
  | "shoppingPriceHistory"
  | "yearPlanPhase"
  | "$transaction"
>;

// Dispatches one confirmed draft to the existing domain function for its
// intent. Every branch reuses domain logic that already existed before
// Quick Capture — this file is pure orchestration, never a new way to
// write to the database.
export async function executeDraft(
  prisma: ExecutePrisma,
  userId: string,
  cycleStartDay: number,
  draft: CommandDraft,
): Promise<ExecuteResult> {
  switch (draft.intent) {
    case "expense":
    case "income":
    case "refund":
    case "credit_card_charge": {
      if (!draft.account.id) return { ok: false, error: "An account is required" };
      const type =
        draft.intent === "credit_card_charge"
          ? "EXPENSE"
          : (draft.intent.toUpperCase() as "EXPENSE" | "INCOME" | "REFUND");
      const transaction = await createExpenseLikeTransaction(prisma, userId, cycleStartDay, {
        type,
        amount: draft.amountMinorUnits,
        date: draft.date.value,
        accountId: draft.account.id,
        categoryId: draft.category?.id ?? undefined,
        description: draft.description,
      });
      return { ok: true, resultingIds: [transaction.id] };
    }

    case "person_borrowed": {
      if (!draft.account.id) return { ok: false, error: "An account is required" };
      const transaction = await createExpenseLikeTransaction(prisma, userId, cycleStartDay, {
        type: "EXPENSE",
        amount: draft.amountMinorUnits,
        date: draft.date.value,
        accountId: draft.account.id,
        description: `Lent to ${draft.personName}`,
      });
      return { ok: true, resultingIds: [transaction.id] };
    }

    case "transfer": {
      if (!draft.sourceAccount.id || !draft.destinationAccount.id) {
        return { ok: false, error: "Both accounts are required" };
      }
      const transfer = await createTransferTransaction(prisma, userId, cycleStartDay, {
        amount: draft.amountMinorUnits,
        date: draft.date.value,
        sourceAccountId: draft.sourceAccount.id,
        destinationAccountId: draft.destinationAccount.id,
        description: draft.description,
      });
      const resultingIds = [transfer.outgoingTransactionId, transfer.incomingTransactionId];
      if (draft.feeMinorUnits > 0) {
        const fee = await createExpenseLikeTransaction(prisma, userId, cycleStartDay, {
          type: "TRANSFER_FEE",
          amount: draft.feeMinorUnits,
          date: draft.date.value,
          accountId: draft.sourceAccount.id,
          description: "Transfer fee",
        });
        resultingIds.push(fee.id);
      }
      return { ok: true, resultingIds };
    }

    case "credit_card_payment": {
      if (!draft.payingAccount.id || !draft.creditCardAccount.id) {
        return { ok: false, error: "Both accounts are required" };
      }
      const card = await prisma.creditCard.findFirst({
        where: { accountId: draft.creditCardAccount.id, userId },
      });
      if (!card) return { ok: false, error: "Credit card not found" };
      const result = await makeCreditCardPayment(prisma, userId, cycleStartDay, card.id, {
        accountId: draft.payingAccount.id,
        amount: draft.amountMinorUnits,
        date: draft.date.value,
      });
      if (!result.ok) return result;
      return { ok: true, resultingIds: [] }; // makeCreditCardPayment doesn't return the transaction id today
    }

    case "loan_payment": {
      if (!draft.payingAccount.id || !draft.loan.id) {
        return { ok: false, error: "An account and a loan are required" };
      }
      const result = await makeLoanPayment(prisma, userId, cycleStartDay, draft.loan.id, {
        accountId: draft.payingAccount.id,
        amount: draft.amountMinorUnits,
        date: draft.date.value,
      });
      if (!result.ok) return result;
      return { ok: true, resultingIds: [] };
    }

    case "reconciliation": {
      if (!draft.account.id) return { ok: false, error: "An account is required" };
      const result = await applyReconciliation(
        prisma,
        userId,
        cycleStartDay,
        draft.account.id,
        draft.actualBalanceMinorUnits,
      );
      if (!result.ok) return result;
      return { ok: true, resultingIds: result.transactionId ? [result.transactionId] : [] };
    }

    case "payable_create": {
      if (!draft.account.id) return { ok: false, error: "An account is required" };
      const payable = await createPayable(prisma, userId, {
        name: draft.name,
        amount: draft.amountMinorUnits,
        dueDate: draft.dueDate.value,
        dueDateConfirmed: draft.dueDate.confirmed,
        accountId: draft.account.id,
        categoryId: draft.category?.id ?? undefined,
        notes: draft.notes ?? undefined,
      });
      return { ok: true, resultingIds: [payable.id] };
    }

    case "payable_update": {
      if (!draft.target.id) return { ok: false, error: "Couldn't identify which payable to update" };
      const existing = await prisma.payable.findFirst({ where: { id: draft.target.id, userId } });
      if (!existing) return { ok: false, error: "Payable not found" };
      const previousValues = { amount: existing.amount, dueDate: existing.dueDate, notes: existing.notes };
      const result = await updatePayable(prisma, userId, draft.target.id, {
        amount: draft.amountMinorUnits ?? undefined,
        dueDate: draft.dueDate?.value,
        dueDateConfirmed: draft.dueDate?.confirmed,
        notes: draft.notesRemove ? undefined : draft.notes ?? undefined,
      });
      if (!result.ok) return result;
      return { ok: true, resultingIds: [draft.target.id], previousValues };
    }

    case "transaction_update": {
      if (!draft.target.id) return { ok: false, error: "Couldn't identify which transaction to change" };
      const existing = await prisma.transaction.findFirst({ where: { id: draft.target.id, userId } });
      if (!existing) return { ok: false, error: "Transaction not found" };
      const previousValues = { amount: existing.amount, date: existing.date, description: existing.description };

      let amount: number | undefined;
      if (draft.amountMinorUnits !== null && draft.amountMinorUnits !== undefined) {
        const magnitude = Math.abs(draft.amountMinorUnits);
        // A correction's amount always arrives as a non-negative magnitude
        // from the parser — it must be re-signed the same way the original
        // amount was, or a correction silently flips an expense into income
        // (or vice versa). TRANSFER isn't in signedAmountForType's type
        // union (its sign comes from which leg it is, not the type alone)
        // — preserve the existing row's own sign direction instead.
        amount =
          existing.type === "TRANSFER"
            ? existing.amount < 0
              ? -magnitude
              : magnitude
            : signedAmountForType(existing.type as SignableTransactionType, magnitude);
      }

      const result = await updateTransaction(prisma, userId, draft.target.id, {
        amount,
        date: draft.date?.value,
        description: draft.description ?? undefined,
      });
      if (!result.ok) return result;
      return { ok: true, resultingIds: [draft.target.id], previousValues };
    }

    case "transaction_delete": {
      if (!draft.target.id) return { ok: false, error: "Couldn't identify which transaction to delete" };
      const result = await deleteTransaction(prisma, userId, draft.target.id);
      if (!result.ok) return result;
      // Deliberately not undoable — see the design spec's "Undo, backed
      // by QuickCaptureLog" section. resultingIds is empty on purpose.
      return { ok: true, resultingIds: [] };
    }

    case "shopping_schedule": {
      const list = await prisma.shoppingList.findFirst({ where: { userId, isCurrent: true } });
      if (!list) return { ok: false, error: "No current shopping list to schedule" };
      const previousValues = { plannedDate: list.plannedDate };
      await prisma.shoppingList.update({ where: { id: list.id }, data: { plannedDate: draft.date.value } });
      return { ok: true, resultingIds: [list.id], previousValues };
    }

    case "question":
      return { ok: false, error: "Answering questions isn't available yet" };
  }
}

// Reverses a confirmed draft using exactly what executeDraft recorded —
// never a guess. transaction_delete and any already-balanced
// reconciliation have no resultingIds, so undoing them is a no-op.
export async function undoExecution(
  prisma: Pick<PrismaClient, "transaction" | "payable" | "shoppingList" | "shoppingListItem" | "yearPlanPhase">,
  userId: string,
  intent: CommandDraft["intent"],
  resultingIds: string[],
  previousValues: Record<string, unknown> | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (resultingIds.length === 0) {
    return { ok: true };
  }

  if (intent === "transaction_update" && previousValues) {
    await prisma.transaction.updateMany({
      where: { id: { in: resultingIds }, userId },
      data: previousValues,
    });
    return { ok: true };
  }

  if (intent === "shopping_schedule" && previousValues) {
    await prisma.shoppingList.updateMany({
      where: { id: { in: resultingIds }, userId },
      data: previousValues,
    });
    return { ok: true };
  }

  if (intent === "payable_update" && previousValues) {
    await prisma.payable.updateMany({
      where: { id: { in: resultingIds }, userId },
      data: previousValues,
    });
    return { ok: true };
  }

  if (intent === "payable_create") {
    await prisma.payable.deleteMany({ where: { id: { in: resultingIds }, userId } });
    return { ok: true };
  }

  // expense/income/refund/credit_card_charge/person_borrowed/transfer/reconciliation
  // all reverse the same way: delete the rows that were created.
  await prisma.transaction.deleteMany({ where: { id: { in: resultingIds }, userId } });
  return { ok: true };
}
