import Link from "next/link";
import type { AuditEntityType } from "@/lib/audit-log";

export function AuditHistoryLink({ entityType, entityId }: { entityType: AuditEntityType; entityId: string }) {
  return (
    <Link
      href={`/audit-log?entityType=${entityType}&entityId=${entityId}`}
      className="text-sm text-muted-foreground underline"
    >
      History
    </Link>
  );
}
