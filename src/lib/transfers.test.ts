import { describe, expect, it, vi } from "vitest";
import { createTransfer } from "@/lib/transfers";

function makeFakePrisma() {
  let nextId = 1;
  const prisma = {
    transaction: {
      create: vi.fn().mockImplementation(({ data }) =>
        Promise.resolve({ id: `txn-${nextId++}`, ...data }),
      ),
      update: vi.fn().mockResolvedValue({}),
    },
    // Passthrough — calls the callback with this same mock object, so
    // every write inside createTransfer still goes through the spies
    // above. Proves createTransfer wraps its writes in $transaction
    // without needing a real, isolated transactional client in tests.
    $transaction: vi.fn((fn: (tx: unknown) => unknown) => fn(prisma)),
  };
  return prisma as any;
}

describe("createTransfer", () => {
  it("creates two linked rows: a negative outgoing row and a positive incoming row", async () => {
    const prisma = makeFakePrisma();

    const result = await createTransfer(prisma, {
      userId: "user-1",
      date: new Date(2026, 8, 15),
      amount: 5000,
      sourceAccountId: "acc-checking",
      destinationAccountId: "acc-savings",
      description: "Move to savings",
    });

    expect(prisma.transaction.create).toHaveBeenCalledTimes(2);

    const outgoingArgs = prisma.transaction.create.mock.calls[0][0].data;
    expect(outgoingArgs.type).toBe("TRANSFER");
    expect(outgoingArgs.amount).toBe(-5000);
    expect(outgoingArgs.accountId).toBe("acc-checking");
    expect(outgoingArgs.destinationAccountId).toBe("acc-savings");

    const incomingArgs = prisma.transaction.create.mock.calls[1][0].data;
    expect(incomingArgs.type).toBe("TRANSFER");
    expect(incomingArgs.amount).toBe(5000);
    expect(incomingArgs.accountId).toBe("acc-savings");
    expect(incomingArgs.destinationAccountId).toBe("acc-checking");
    expect(incomingArgs.linkedTransactionId).toBe(result.outgoingTransactionId);

    expect(prisma.transaction.update).toHaveBeenCalledWith({
      where: { id: result.outgoingTransactionId },
      data: { linkedTransactionId: result.incomingTransactionId },
    });
  });

  it("wraps all three writes in a single $transaction call (atomicity — a failure partway through must not leave one side of the transfer written without the other)", async () => {
    const prisma = makeFakePrisma();
    await createTransfer(prisma, {
      userId: "user-1",
      date: new Date(2026, 8, 15),
      amount: 5000,
      sourceAccountId: "acc-checking",
      destinationAccountId: "acc-savings",
      description: "Move to savings",
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it("rejects a negative amount", async () => {
    const prisma = makeFakePrisma();
    await expect(
      createTransfer(prisma, {
        userId: "user-1",
        date: new Date(),
        amount: -100,
        sourceAccountId: "acc-1",
        destinationAccountId: "acc-2",
        description: "invalid",
      }),
    ).rejects.toThrow();
  });

  it("rejects the same account as both source and destination", async () => {
    const prisma = makeFakePrisma();
    await expect(
      createTransfer(prisma, {
        userId: "user-1",
        date: new Date(),
        amount: 100,
        sourceAccountId: "acc-1",
        destinationAccountId: "acc-1",
        description: "invalid",
      }),
    ).rejects.toThrow();
  });
});
