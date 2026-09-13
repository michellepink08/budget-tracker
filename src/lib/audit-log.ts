import type { PrismaClient } from "@prisma/client";

export type AuditEntityType =
  | "TRANSACTION"
  | "TRANSFER"
  | "PAYABLE_PAYMENT"
  | "RECEIPT_CONFIRMATION"
  | "RECURRING_OCCURRENCE"
  | "RECURRING_PAYABLE_OCCURRENCE"
  | "INSTALLMENT_PAYMENT"
  | "CREDIT_CARD_PAYMENT"
  | "REMINDER_PAYMENT"
  | "RECONCILIATION";

export type AuditAction = "CREATE" | "UPDATE" | "DELETE" | "REVERSE";
export type AuditSource = "FORM" | "RECEIPT" | "RECURRING_RULE" | "SYSTEM";

export type RecordAuditInput = {
  userId: string;
  entityType: AuditEntityType;
  entityId: string;
  action: AuditAction;
  source: AuditSource;
  previousValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  relatedRecordIds?: string[];
  reversalOfId?: string;
};

// The one place that writes an AuditLog row. Called either inside a domain
// function's own $transaction (when Quick Capture never calls that
// function) or at the server-action layer wrapping a shared domain function
// in a new $transaction (when Quick Capture also calls it directly) — see
// docs/superpowers/specs/2026-09-14-audit-history-design.md for which is
// which. Quick Capture's own logging (QuickCaptureLog) never calls this.
export async function recordAudit(
  prisma: Pick<PrismaClient, "auditLog">,
  input: RecordAuditInput,
): Promise<{ id: string }> {
  const row = await prisma.auditLog.create({
    data: {
      userId: input.userId,
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      source: input.source,
      previousValuesJson: input.previousValues ? JSON.stringify(input.previousValues) : null,
      newValuesJson: input.newValues ? JSON.stringify(input.newValues) : null,
      relatedRecordIds: input.relatedRecordIds ?? [],
      reversalOfId: input.reversalOfId,
    },
  });
  return { id: row.id };
}
