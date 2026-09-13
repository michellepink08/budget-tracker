import type { PrismaClient } from "@prisma/client";
import type { AuditEntityType } from "@/lib/audit-log";

export type AuditLogFilter = { entityType?: AuditEntityType; entityId?: string };

export async function listAuditLog(
  prisma: Pick<PrismaClient, "auditLog">,
  userId: string,
  filter: AuditLogFilter,
) {
  return prisma.auditLog.findMany({
    where: {
      userId,
      ...(filter.entityType ? { entityType: filter.entityType } : {}),
      ...(filter.entityId ? { entityId: filter.entityId } : {}),
    },
    orderBy: { createdAt: "desc" },
    include: { reversedBy: true },
  });
}
