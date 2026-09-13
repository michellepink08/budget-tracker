import { formatMoney } from "@/lib/money";
import type { AuditEntityType } from "@/lib/audit-log";

const ENTITY_LABELS: Record<AuditEntityType, string> = {
  TRANSACTION: "Transaction",
  TRANSFER: "Transfer",
  PAYABLE_PAYMENT: "Bill payment",
  RECEIPT_CONFIRMATION: "Receipt",
  RECURRING_OCCURRENCE: "Recurring transaction",
  RECURRING_PAYABLE_OCCURRENCE: "Recurring bill",
  INSTALLMENT_PAYMENT: "Installment payment",
  CREDIT_CARD_PAYMENT: "Credit card payment",
  REMINDER_PAYMENT: "Reminder payment",
  RECONCILIATION: "Balance adjustment",
};

export function auditEntityLabel(entityType: AuditEntityType): string {
  return ENTITY_LABELS[entityType];
}

export function auditActionLabel(action: string): string {
  if (action === "REVERSE") return "Undone";
  if (action === "DELETE") return "Deleted";
  if (action === "UPDATE") return "Edited";
  return "Created";
}

// currency is a best-effort display default (the app is single-currency-
// per-account, and AuditLog doesn't itself store one) — good enough for a
// history list where the amount is secondary to the description.
export function formatAuditAmount(minorUnits: number, currency = "PHP"): string {
  return formatMoney(minorUnits, currency);
}
