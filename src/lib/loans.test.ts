import { describe, expect, it, vi } from "vitest";
import { archiveLoan, createLoan, listLoans, makeLoanPayment, updateLoan } from "@/lib/loans";

const SAMPLE_LOAN = {
  id: "loan-1",
  userId: "user-1",
  name: "Car loan",
  principal: 50000000,
  interestRate: 5.5,
  monthlyPayment: 1500000,
  remainingBalance: 3000000,
  startDate: new Date(2025, 0, 1),
  archivedAt: null,
};

function makeFakePrisma(loan: unknown = SAMPLE_LOAN) {
  return {
    loan: {
      create: vi.fn().mockResolvedValue({ id: "loan-new" }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      update: vi.fn().mockResolvedValue({}),
      findFirst: vi.fn().mockResolvedValue(loan),
      findMany: vi.fn().mockResolvedValue([]),
    },
    budgetPeriod: {
      findUnique: vi.fn().mockResolvedValue({ id: "period-1" }),
      create: vi.fn(),
    },
    transaction: {
      create: vi.fn().mockResolvedValue({ id: "txn-1" }),
    },
  } as any;
}

describe("createLoan", () => {
  it("creates a loan scoped to the given user", async () => {
    const prisma = makeFakePrisma();
    const input = {
      name: "Car loan",
      principal: 50000000,
      interestRate: 5.5,
      monthlyPayment: 1500000,
      remainingBalance: 3000000,
      startDate: new Date(2025, 0, 1),
    };

    await createLoan(prisma, "user-1", input);

    expect(prisma.loan.create).toHaveBeenCalledWith({ data: { userId: "user-1", ...input } });
  });
});

describe("updateLoan", () => {
  it("updates only when the loan belongs to the user", async () => {
    const prisma = makeFakePrisma();

    const result = await updateLoan(prisma, "user-1", "loan-1", { monthlyPayment: 1600000 });

    expect(result).toEqual({ ok: true });
    expect(prisma.loan.updateMany).toHaveBeenCalledWith({
      where: { id: "loan-1", userId: "user-1" },
      data: { monthlyPayment: 1600000 },
    });
  });

  it("reports not found when no row matched", async () => {
    const prisma = makeFakePrisma();
    prisma.loan.updateMany.mockResolvedValue({ count: 0 });

    const result = await updateLoan(prisma, "user-1", "loan-1", { monthlyPayment: 1600000 });

    expect(result).toEqual({ ok: false, error: "Loan not found" });
  });
});

describe("archiveLoan", () => {
  it("sets archivedAt for a loan belonging to the user", async () => {
    const prisma = makeFakePrisma();

    const result = await archiveLoan(prisma, "user-1", "loan-1");

    expect(result).toEqual({ ok: true });
    const args = prisma.loan.updateMany.mock.calls[0][0];
    expect(args.where).toEqual({ id: "loan-1", userId: "user-1" });
    expect(args.data.archivedAt).toBeInstanceOf(Date);
  });
});

describe("listLoans", () => {
  it("scopes to the user and excludes archived loans by default", async () => {
    const prisma = makeFakePrisma();

    await listLoans(prisma, "user-1");

    expect(prisma.loan.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1", archivedAt: null },
      orderBy: { createdAt: "asc" },
    });
  });

  it("includes archived loans when asked", async () => {
    const prisma = makeFakePrisma();

    await listLoans(prisma, "user-1", { includeArchived: true });

    expect(prisma.loan.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      orderBy: { createdAt: "asc" },
    });
  });
});

describe("makeLoanPayment", () => {
  it("creates a LOAN_PAYMENT transaction and decrements remainingBalance", async () => {
    const prisma = makeFakePrisma();

    const result = await makeLoanPayment(prisma, "user-1", 25, "loan-1", {
      accountId: "acc-1",
      amount: 1500000,
      date: new Date(2026, 8, 12),
    });

    expect(result).toEqual({ ok: true });
    const txnArgs = prisma.transaction.create.mock.calls[0][0].data;
    expect(txnArgs.type).toBe("LOAN_PAYMENT");
    expect(txnArgs.amount).toBe(-1500000);
    expect(txnArgs.accountId).toBe("acc-1");

    expect(prisma.loan.update).toHaveBeenCalledWith({
      where: { id: "loan-1" },
      data: { remainingBalance: 1500000 },
    });
  });

  it("clamps remainingBalance at zero instead of going negative", async () => {
    const prisma = makeFakePrisma();

    await makeLoanPayment(prisma, "user-1", 25, "loan-1", {
      accountId: "acc-1",
      amount: 5000000, // more than the 3000000 remaining
      date: new Date(2026, 8, 12),
    });

    expect(prisma.loan.update).toHaveBeenCalledWith({
      where: { id: "loan-1" },
      data: { remainingBalance: 0 },
    });
  });

  it("reports not found for a loan the user doesn't own", async () => {
    const prisma = makeFakePrisma(null);

    const result = await makeLoanPayment(prisma, "user-1", 25, "loan-1", {
      accountId: "acc-1",
      amount: 1500000,
      date: new Date(2026, 8, 12),
    });

    expect(result).toEqual({ ok: false, error: "Loan not found" });
    expect(prisma.transaction.create).not.toHaveBeenCalled();
  });
});
