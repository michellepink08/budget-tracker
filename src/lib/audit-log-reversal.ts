import type { Prisma, PrismaClient } from "@prisma/client";
import { recordAudit } from "@/lib/audit-log";
import type { AuditSource } from "@/lib/audit-log";

export type AuditLogRow = {
  id: string;
  userId: string;
  entityType: string;
  entityId: string;
  action: string;
  source: string;
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
