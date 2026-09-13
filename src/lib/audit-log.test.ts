import { describe, expect, it, vi } from "vitest";
import { recordAudit } from "@/lib/audit-log";

function makeFakePrisma() {
  return {
    auditLog: {
      create: vi.fn(async ({ data }: any) => ({ id: "audit-1", ...data })),
    },
  } as any;
}

describe("recordAudit", () => {
  it("writes a row with the given fields, JSON-encoding previous/new values", async () => {
    const prisma = makeFakePrisma();

    const result = await recordAudit(prisma, {
      userId: "user-1",
      entityType: "PAYABLE_PAYMENT",
      entityId: "payable-1",
      action: "CREATE",
      source: "FORM",
      previousValues: { status: "PENDING" },
      newValues: { status: "PAID" },
      relatedRecordIds: ["txn-1"],
    });

    expect(result.id).toBe("audit-1");
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        entityType: "PAYABLE_PAYMENT",
        entityId: "payable-1",
        action: "CREATE",
        source: "FORM",
        previousValuesJson: JSON.stringify({ status: "PENDING" }),
        newValuesJson: JSON.stringify({ status: "PAID" }),
        relatedRecordIds: ["txn-1"],
        reversalOfId: undefined,
      },
    });
  });

  it("stores null for previousValues/newValues when omitted, and defaults relatedRecordIds to []", async () => {
    const prisma = makeFakePrisma();

    await recordAudit(prisma, {
      userId: "user-1",
      entityType: "TRANSACTION",
      entityId: "txn-1",
      action: "CREATE",
      source: "FORM",
    });

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        entityType: "TRANSACTION",
        entityId: "txn-1",
        action: "CREATE",
        source: "FORM",
        previousValuesJson: null,
        newValuesJson: null,
        relatedRecordIds: [],
        reversalOfId: undefined,
      },
    });
  });
});
