import { describe, expect, it, vi } from "vitest";
import {
  archiveLoan,
  computeLoanRemainingBalance,
  createLoan,
  listLoans,
  makeLoanPayment,
  resolveOrCreateLoanSubcategory,
  updateLoan,
} from "@/lib/loans";

const SAMPLE_LOAN = {
  id: "loan-1",
  userId: "user-1",
  name: "Car loan",
  principal: 50000000,
  interestRate: 5.5,
  monthlyPayment: 1500000,
  openingBalance: 3000000,
  categoryId: "cat-loan",
  subcategoryId: "sub-1",
  startDate: new Date(2025, 0, 1),
  archivedAt: null,
};

function makeFakePrisma(loan: unknown = SAMPLE_LOAN) {
  return {
    loan: {
      create: vi.fn().mockResolvedValue({ id: "loan-new" }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findFirst: vi.fn().mockResolvedValue(loan),
      findMany: vi.fn().mockResolvedValue([]),
    },
    budgetPeriod: {
      findUnique: vi.fn().mockResolvedValue({ id: "period-1" }),
      create: vi.fn(),
    },
    transaction: {
      create: vi.fn().mockResolvedValue({ id: "txn-1" }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    category: {
      findFirst: vi.fn().mockResolvedValue({ id: "cat-loan", name: "Loan" }),
      create: vi.fn().mockResolvedValue({ id: "cat-loan-new", name: "Loan" }),
    },
    subcategory: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: "sub-new" }),
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
      openingBalance: 3000000,
      categoryId: "cat-loan",
      subcategoryId: "sub-1",
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
  it("scopes to the user, excludes archived loans by default, and includes the subcategory name", async () => {
    const prisma = makeFakePrisma();

    await listLoans(prisma, "user-1");

    expect(prisma.loan.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1", archivedAt: null },
      include: { subcategory: true },
      orderBy: { createdAt: "asc" },
    });
  });

  it("includes archived loans when asked", async () => {
    const prisma = makeFakePrisma();

    await listLoans(prisma, "user-1", { includeArchived: true });

    expect(prisma.loan.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      include: { subcategory: true },
      orderBy: { createdAt: "asc" },
    });
  });
});

describe("makeLoanPayment", () => {
  it("creates a LOAN_PAYMENT transaction carrying the loan's own subcategory, and never mutates a balance", async () => {
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
    expect(txnArgs.categoryId).toBe("cat-loan");
    expect(txnArgs.subcategoryId).toBe("sub-1");
    expect(txnArgs.loanId).toBe("loan-1");
    expect(prisma.loan.updateMany).not.toHaveBeenCalled();
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

describe("computeLoanRemainingBalance", () => {
  it("uses the explicit loan identity instead of another loan sharing its category", async () => {
    const prisma:any={transaction:{findMany:vi.fn().mockResolvedValue([{loanId:"a",userId:"u",type:"LOAN_PAYMENT",amount:-1000},{loanId:"b",userId:"u",type:"LOAN_PAYMENT",amount:-500}])}};
    expect(await computeLoanRemainingBalance(prisma,{id:"a",userId:"u",openingBalance:5000,subcategoryId:"shared"})).toBe(4000);
  });
  it("returns the opening balance as-is when the loan has no subcategory linked yet", async () => {
    const prisma = { transaction: { findMany: vi.fn() } } as any;

    const remaining = await computeLoanRemainingBalance(prisma, { openingBalance: 3000000, subcategoryId: null });

    expect(remaining).toBe(3000000);
    expect(prisma.transaction.findMany).not.toHaveBeenCalled();
  });

  it("subtracts every transaction linked to the loan's subcategory from the opening balance", async () => {
    const prisma = {
      transaction: { findMany: vi.fn().mockResolvedValue([{ amount: -500000 }, { amount: -300000 }]) },
    } as any;

    const remaining = await computeLoanRemainingBalance(prisma, { openingBalance: 3000000, subcategoryId: "sub-1" });

    expect(remaining).toBe(2200000);
    expect(prisma.transaction.findMany).toHaveBeenCalledWith({ where: { subcategoryId: "sub-1" } });
  });

  it("clamps at zero instead of going negative", async () => {
    const prisma = {
      transaction: { findMany: vi.fn().mockResolvedValue([{ amount: -5000000 }]) },
    } as any;

    const remaining = await computeLoanRemainingBalance(prisma, { openingBalance: 3000000, subcategoryId: "sub-1" });

    expect(remaining).toBe(0);
  });
});

describe("resolveOrCreateLoanSubcategory", () => {
  it("creates the shared 'Loan' category the first time, then a subcategory under it", async () => {
    const prisma = makeFakePrisma();
    prisma.category.findFirst.mockResolvedValue(null);

    const result = await resolveOrCreateLoanSubcategory(prisma, "user-1", "Shopee Pay Later");

    expect(prisma.category.create).toHaveBeenCalledWith({
      data: { userId: "user-1", name: "Loan", type: "DEBT_PAYMENT", color: "coral", icon: "tag" },
    });
    expect(prisma.subcategory.create).toHaveBeenCalledWith({
      data: { userId: "user-1", categoryId: "cat-loan-new", name: "Shopee Pay Later" },
    });
    expect(result).toEqual({ categoryId: "cat-loan-new", subcategoryId: "sub-new" });
  });

  it("reuses an existing 'Loan' category instead of creating a second one", async () => {
    const prisma = makeFakePrisma();

    await resolveOrCreateLoanSubcategory(prisma, "user-1", "GCredit");

    expect(prisma.category.create).not.toHaveBeenCalled();
  });

  it("matches an existing subcategory by name, case-insensitively, instead of creating a duplicate", async () => {
    const prisma = makeFakePrisma();
    prisma.subcategory.findMany.mockResolvedValue([{ id: "sub-existing", name: "gcredit" }]);

    const result = await resolveOrCreateLoanSubcategory(prisma, "user-1", "GCredit");

    expect(prisma.subcategory.create).not.toHaveBeenCalled();
    expect(result).toEqual({ categoryId: "cat-loan", subcategoryId: "sub-existing" });
  });
});
