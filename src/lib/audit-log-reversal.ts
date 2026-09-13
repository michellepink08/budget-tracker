import type { Prisma, PrismaClient } from "@prisma/client";
import { recordAudit } from "@/lib/audit-log";
import type { AuditEntityType, AuditSource } from "@/lib/audit-log";

export type AuditLogRow = {
  id: string;
  userId: string;
  entityType: AuditEntityType;
  entityId: string;
  action: string;
  source: AuditSource;
  previousValuesJson: string | null;
  newValuesJson: string | null;
  relatedRecordIds: string[];
};

export type ReversalResult = { ok: true } | { ok: false; error: string };

function parseJson<T>(json: string | null): T | null {
  return json ? (JSON.parse(json) as T) : null;
}

// JSON.stringify turns a Date into an ISO string; JSON.parse doesn't turn it
// back. A recreated Transaction row's date/createdAt fields need to be real
// Date instances again before going back through Prisma's create().
function reviveTransactionDates(row: Record<string, unknown>): Record<string, unknown> {
  return {
    ...row,
    ...(typeof row.date === "string" ? { date: new Date(row.date as string) } : {}),
    ...(typeof row.createdAt === "string" ? { createdAt: new Date(row.createdAt as string) } : {}),
  };
}

export async function reverseTransaction(
  prisma: Pick<PrismaClient, "transaction" | "auditLog" | "$transaction">,
  userId: string,
  entry: AuditLogRow,
): Promise<ReversalResult> {
  return prisma.$transaction(async (tx) => {
    if (entry.action === "CREATE") {
      await tx.transaction.deleteMany({ where: { id: { in: [entry.entityId] }, userId } });
    } else if (entry.action === "DELETE") {
      const previous = parseJson<{ rows: Record<string, unknown>[] }>(entry.previousValuesJson);
      for (const row of previous?.rows ?? []) {
        // The row's exact shape is whatever was captured at delete time —
        // Prisma's generated CreateInput type can't be statically matched
        // against an arbitrary historical snapshot.
        await tx.transaction.create({ data: reviveTransactionDates(row) as Prisma.TransactionUncheckedCreateInput });
      }
    } else if (entry.action === "UPDATE") {
      const previous = parseJson<Record<string, unknown>>(entry.previousValuesJson);
      await tx.transaction.update({ where: { id: entry.entityId }, data: previous ?? {} });
    }

    await recordAudit(tx, {
      userId,
      entityType: "TRANSACTION",
      entityId: entry.entityId,
      action: "REVERSE",
      source: entry.source as AuditSource,
      reversalOfId: entry.id,
    });

    return { ok: true };
  });
}

export async function reverseTransfer(
  prisma: Pick<PrismaClient, "transaction" | "auditLog" | "$transaction">,
  userId: string,
  entry: AuditLogRow,
): Promise<ReversalResult> {
  return prisma.$transaction(async (tx) => {
    const ids = [entry.entityId, ...entry.relatedRecordIds];
    await tx.transaction.deleteMany({ where: { id: { in: ids }, userId } });

    await recordAudit(tx, {
      userId,
      entityType: "TRANSFER",
      entityId: entry.entityId,
      action: "REVERSE",
      source: entry.source as AuditSource,
      reversalOfId: entry.id,
    });

    return { ok: true };
  });
}

export async function reversePayablePayment(
  prisma: Pick<PrismaClient, "transaction" | "payable" | "auditLog" | "$transaction">,
  userId: string,
  entry: AuditLogRow,
): Promise<ReversalResult> {
  return prisma.$transaction(async (tx) => {
    await tx.transaction.deleteMany({ where: { id: { in: entry.relatedRecordIds }, userId } });
    await tx.payable.update({
      where: { id: entry.entityId },
      data: { status: "PENDING", paidTransactionId: null },
    });

    await recordAudit(tx, {
      userId,
      entityType: "PAYABLE_PAYMENT",
      entityId: entry.entityId,
      action: "REVERSE",
      source: entry.source as AuditSource,
      reversalOfId: entry.id,
    });

    return { ok: true };
  });
}

export async function reverseReceiptConfirmation(
  prisma: Pick<PrismaClient, "transaction" | "shoppingPriceHistory" | "receipt" | "auditLog" | "$transaction">,
  userId: string,
  entry: AuditLogRow,
): Promise<ReversalResult> {
  return prisma.$transaction(async (tx) => {
    const [transactionId, ...priceHistoryIds] = entry.relatedRecordIds;
    if (transactionId) {
      await tx.transaction.deleteMany({ where: { id: { in: [transactionId] }, userId } });
    }
    if (priceHistoryIds.length > 0) {
      await tx.shoppingPriceHistory.deleteMany({ where: { id: { in: priceHistoryIds }, userId } });
    }
    await tx.receipt.update({
      where: { id: entry.entityId },
      data: { status: "REVIEWED", transactionId: null },
    });

    await recordAudit(tx, {
      userId,
      entityType: "RECEIPT_CONFIRMATION",
      entityId: entry.entityId,
      action: "REVERSE",
      source: entry.source as AuditSource,
      reversalOfId: entry.id,
    });

    return { ok: true };
  });
}

export async function reverseInstallmentPayment(
  prisma: Pick<PrismaClient, "transaction" | "installmentPayment" | "auditLog" | "$transaction">,
  userId: string,
  entry: AuditLogRow,
): Promise<ReversalResult> {
  return prisma.$transaction(async (tx) => {
    await tx.transaction.deleteMany({ where: { id: { in: entry.relatedRecordIds }, userId } });
    await tx.installmentPayment.update({
      where: { id: entry.entityId },
      data: { status: "PENDING", paidTransactionId: null },
    });

    await recordAudit(tx, {
      userId,
      entityType: "INSTALLMENT_PAYMENT",
      entityId: entry.entityId,
      action: "REVERSE",
      source: entry.source as AuditSource,
      reversalOfId: entry.id,
    });

    return { ok: true };
  });
}

export async function reverseCreditCardPayment(
  prisma: Pick<PrismaClient, "transaction" | "auditLog" | "$transaction">,
  userId: string,
  entry: AuditLogRow,
): Promise<ReversalResult> {
  return prisma.$transaction(async (tx) => {
    await tx.transaction.deleteMany({ where: { id: { in: [entry.entityId] }, userId } });

    await recordAudit(tx, {
      userId,
      entityType: "CREDIT_CARD_PAYMENT",
      entityId: entry.entityId,
      action: "REVERSE",
      source: entry.source as AuditSource,
      reversalOfId: entry.id,
    });

    return { ok: true };
  });
}

export async function reverseReconciliation(
  prisma: Pick<PrismaClient, "transaction" | "auditLog" | "$transaction">,
  userId: string,
  entry: AuditLogRow,
): Promise<ReversalResult> {
  return prisma.$transaction(async (tx) => {
    await tx.transaction.deleteMany({ where: { id: { in: [entry.entityId] }, userId } });

    await recordAudit(tx, {
      userId,
      entityType: "RECONCILIATION",
      entityId: entry.entityId,
      action: "REVERSE",
      source: entry.source as AuditSource,
      reversalOfId: entry.id,
    });

    return { ok: true };
  });
}

export async function reverseRecurringOccurrence(
  prisma: Pick<PrismaClient, "transaction" | "recurringRule" | "auditLog" | "$transaction">,
  userId: string,
  entry: AuditLogRow,
): Promise<ReversalResult> {
  return prisma.$transaction(async (tx) => {
    const rule = await tx.recurringRule.findFirst({ where: { id: entry.entityId, userId } });
    if (!rule) return { ok: false, error: "Recurring rule not found" };

    const newValues = parseJson<{ nextDate: string }>(entry.newValuesJson);
    if (newValues && new Date(rule.nextDate).getTime() !== new Date(newValues.nextDate).getTime()) {
      return { ok: false, error: "A later occurrence has already been confirmed" };
    }

    const previous = parseJson<{ nextDate: string }>(entry.previousValuesJson);
    if (previous) {
      await tx.recurringRule.update({ where: { id: entry.entityId }, data: { nextDate: new Date(previous.nextDate) } });
    }
    await tx.transaction.deleteMany({ where: { id: { in: entry.relatedRecordIds }, userId } });

    await recordAudit(tx, {
      userId,
      entityType: "RECURRING_OCCURRENCE",
      entityId: entry.entityId,
      action: "REVERSE",
      source: entry.source as AuditSource,
      reversalOfId: entry.id,
    });

    return { ok: true };
  });
}

export async function reverseRecurringPayableOccurrence(
  prisma: Pick<PrismaClient, "recurringPayable" | "payable" | "auditLog" | "$transaction">,
  userId: string,
  entry: AuditLogRow,
): Promise<ReversalResult> {
  return prisma.$transaction(async (tx) => {
    const rule = await tx.recurringPayable.findFirst({ where: { id: entry.entityId, userId } });
    if (!rule) return { ok: false, error: "Recurring payable not found" };

    const newValues = parseJson<{ nextDueDate: string }>(entry.newValuesJson);
    if (newValues && new Date(rule.nextDueDate).getTime() !== new Date(newValues.nextDueDate).getTime()) {
      return { ok: false, error: "A later occurrence has already been confirmed" };
    }

    const [payableId] = entry.relatedRecordIds;
    const payable = payableId ? await tx.payable.findFirst({ where: { id: payableId, userId } }) : null;
    if (payable && payable.status !== "PENDING") {
      return { ok: false, error: "This bill has already been paid — unpay it first" };
    }

    if (payableId) {
      await tx.payable.deleteMany({ where: { id: { in: [payableId] }, userId } });
    }
    const previous = parseJson<{ nextDueDate: string }>(entry.previousValuesJson);
    if (previous) {
      await tx.recurringPayable.update({
        where: { id: entry.entityId },
        data: { nextDueDate: new Date(previous.nextDueDate) },
      });
    }

    await recordAudit(tx, {
      userId,
      entityType: "RECURRING_PAYABLE_OCCURRENCE",
      entityId: entry.entityId,
      action: "REVERSE",
      source: entry.source as AuditSource,
      reversalOfId: entry.id,
    });

    return { ok: true };
  });
}

export async function reverseReminderPayment(
  prisma: Pick<PrismaClient, "transaction" | "customReminder" | "auditLog" | "$transaction">,
  userId: string,
  entry: AuditLogRow,
): Promise<ReversalResult> {
  return prisma.$transaction(async (tx) => {
    await tx.transaction.deleteMany({ where: { id: { in: entry.relatedRecordIds }, userId } });
    await tx.customReminder.update({
      where: { id: entry.entityId },
      data: { state: "UPCOMING", linkedTransactionId: null },
    });

    await recordAudit(tx, {
      userId,
      entityType: "REMINDER_PAYMENT",
      entityId: entry.entityId,
      action: "REVERSE",
      source: entry.source as AuditSource,
      reversalOfId: entry.id,
    });

    return { ok: true };
  });
}

export type UndoPrisma = Pick<
  PrismaClient,
  | "auditLog"
  | "transaction"
  | "payable"
  | "receipt"
  | "shoppingPriceHistory"
  | "recurringRule"
  | "recurringPayable"
  | "installmentPayment"
  | "customReminder"
  | "$transaction"
>;

export async function undoAuditLogEntry(
  prisma: UndoPrisma,
  userId: string,
  auditLogId: string,
): Promise<ReversalResult> {
  const entry = await prisma.auditLog.findFirst({ where: { id: auditLogId, userId } });
  if (!entry) return { ok: false, error: "Audit entry not found" };
  if (entry.action === "REVERSE") {
    return { ok: false, error: "This is already an undo — it can't be undone again" };
  }

  const row = entry as unknown as AuditLogRow;
  switch (row.entityType) {
    case "TRANSACTION":
      return reverseTransaction(prisma, userId, row);
    case "TRANSFER":
      return reverseTransfer(prisma, userId, row);
    case "PAYABLE_PAYMENT":
      return reversePayablePayment(prisma, userId, row);
    case "RECEIPT_CONFIRMATION":
      return reverseReceiptConfirmation(prisma, userId, row);
    case "RECURRING_OCCURRENCE":
      return reverseRecurringOccurrence(prisma, userId, row);
    case "RECURRING_PAYABLE_OCCURRENCE":
      return reverseRecurringPayableOccurrence(prisma, userId, row);
    case "INSTALLMENT_PAYMENT":
      return reverseInstallmentPayment(prisma, userId, row);
    case "CREDIT_CARD_PAYMENT":
      return reverseCreditCardPayment(prisma, userId, row);
    case "REMINDER_PAYMENT":
      return reverseReminderPayment(prisma, userId, row);
    case "RECONCILIATION":
      return reverseReconciliation(prisma, userId, row);
    default:
      return { ok: false, error: "Unrecognized audit entry type" };
  }
}
