import { describe, expect, it, vi } from "vitest";
import { listAuditLog } from "@/lib/audit-log-query";

function makeFakePrisma() {
  return {
    auditLog: { findMany: vi.fn().mockResolvedValue([]) },
  } as any;
}

describe("listAuditLog", () => {
  it("scopes to the user, newest first", async () => {
    const prisma = makeFakePrisma();

    await listAuditLog(prisma, "user-1", {});

    expect(prisma.auditLog.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      orderBy: { createdAt: "desc" },
      include: { reversedBy: true },
    });
  });

  it("filters by entityType and entityId when given", async () => {
    const prisma = makeFakePrisma();

    await listAuditLog(prisma, "user-1", { entityType: "TRANSACTION", entityId: "txn-1" });

    expect(prisma.auditLog.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1", entityType: "TRANSACTION", entityId: "txn-1" },
      orderBy: { createdAt: "desc" },
      include: { reversedBy: true },
    });
  });
});
