"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { listAuditLog, type AuditLogFilter } from "@/lib/audit-log-query";
import { undoAuditLogEntry } from "@/lib/audit-log-reversal";

export type AuditLogActionResult = { ok: true } | { ok: false; error: string };

export async function listAuditLogAction(filter: AuditLogFilter) {
  const session = await auth();
  if (!session?.user) return [];
  return listAuditLog(prisma, session.user.id, filter);
}

export async function undoAuditLogEntryAction(auditLogId: string): Promise<AuditLogActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const result = await undoAuditLogEntry(prisma, session.user.id, auditLogId);

  if (result.ok) {
    revalidatePath("/audit-log");
    revalidatePath("/transactions");
    revalidatePath("/accounts");
    revalidatePath("/bills");
    revalidatePath("/loans-cards");
    revalidatePath("/calendar");
  }
  return result;
}
