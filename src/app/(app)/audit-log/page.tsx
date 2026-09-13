import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { listAuditLog } from "@/lib/audit-log-query";
import type { AuditEntityType } from "@/lib/audit-log";
import { auditActionLabel, auditEntityLabel } from "@/components/audit-log/audit-log-summary";
import { UndoButton } from "@/components/audit-log/undo-button";
import { Card } from "@/components/ui/card";

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ entityType?: string; entityId?: string }>;
}) {
  const { entityType, entityId } = await searchParams;
  const session = await auth();
  const user = await prisma.user.findUniqueOrThrow({ where: { id: session!.user.id } });

  const entries: Awaited<ReturnType<typeof listAuditLog>> = await listAuditLog(prisma, user.id, {
    entityType: entityType as AuditEntityType | undefined,
    entityId,
  });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Audit History</h1>
      <p className="text-sm text-muted-foreground">
        Every change that affected a real balance, and — where safe — a way to undo it.
      </p>

      {entries.length === 0 ? (
        <p className="text-muted-foreground">No audit history yet.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {entries.map((entry) => {
            const isReversed = entry.reversedBy.length > 0;
            const canUndo = entry.action !== "REVERSE" && !isReversed;
            return (
              <Card key={entry.id} className="flex items-center justify-between gap-3 p-3">
                <div>
                  <p className="font-medium">
                    {auditEntityLabel(entry.entityType as AuditEntityType)} — {auditActionLabel(entry.action)}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {entry.createdAt.toLocaleString()} · {entry.source.toLowerCase().replace("_", " ")}
                    {isReversed ? " · undone" : ""}
                  </p>
                </div>
                {canUndo && <UndoButton auditLogId={entry.id} />}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
