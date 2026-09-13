import { describe, expect, it, vi } from "vitest";
import { listCalendarEntries } from "@/lib/calendar/aggregate";

function d(year: number, month1based: number, day: number): Date {
  return new Date(year, month1based - 1, day);
}

function makeFakePrisma(overrides: Record<string, any> = {}) {
  return {
    payable: { findMany: vi.fn().mockResolvedValue([]) },
    creditCard: { findMany: vi.fn().mockResolvedValue([]) },
    installmentPayment: { findMany: vi.fn().mockResolvedValue([]) },
    installmentPurchase: { findMany: vi.fn().mockResolvedValue([]) },
    recurringRule: { findMany: vi.fn().mockResolvedValue([]) },
    recurringPayable: { findMany: vi.fn().mockResolvedValue([]) },
    incomeForecast: { findMany: vi.fn().mockResolvedValue([]) },
    shoppingList: { findMany: vi.fn().mockResolvedValue([]) },
    yearPlanPhase: { findMany: vi.fn().mockResolvedValue([]) },
    customReminder: { findMany: vi.fn().mockResolvedValue([]) },
    ...overrides,
  } as any;
}

const range = { start: d(2026, 9, 1), end: d(2026, 9, 30) };
const now = d(2026, 9, 15);

describe("listCalendarEntries — PAYABLE", () => {
  it("maps a pending, not-yet-due payable to an UPCOMING CONFIRMED entry", async () => {
    const prisma = makeFakePrisma({
      payable: {
        findMany: vi.fn().mockResolvedValue([{ id: "pay-1", name: "Electric bill", amount: 250000, dueDate: d(2026, 9, 20), status: "PENDING" }]),
      },
    });
    const entries = await listCalendarEntries(prisma, "user-1", range, now);
    expect(entries).toContainEqual(
      expect.objectContaining({
        sourceType: "PAYABLE", sourceId: "pay-1", label: "Electric bill", amount: 250000,
        confidence: "CONFIRMED", state: "UPCOMING",
      }),
    );
  });

  it("marks a pending payable past its due date as OVERDUE", async () => {
    const prisma = makeFakePrisma({
      payable: {
        findMany: vi.fn().mockResolvedValue([{ id: "pay-1", name: "Electric bill", amount: 250000, dueDate: d(2026, 9, 10), status: "PENDING" }]),
      },
    });
    const entries = await listCalendarEntries(prisma, "user-1", range, now);
    expect(entries[0].state).toBe("OVERDUE");
  });

  it("marks a paid payable as PAID regardless of date", async () => {
    const prisma = makeFakePrisma({
      payable: {
        findMany: vi.fn().mockResolvedValue([{ id: "pay-1", name: "Electric bill", amount: 250000, dueDate: d(2026, 9, 10), status: "PAID" }]),
      },
    });
    const entries = await listCalendarEntries(prisma, "user-1", range, now);
    expect(entries[0].state).toBe("PAID");
  });
});

describe("listCalendarEntries — INSTALLMENT", () => {
  it("maps a pending installment payment", async () => {
    const prisma = makeFakePrisma({
      installmentPayment: {
        findMany: vi.fn().mockResolvedValue([
          { id: "inst-1", installmentPurchaseId: "purch-1", termNumber: 2, amount: 100000, dueDate: d(2026, 9, 25), status: "PENDING" },
        ]),
      },
      installmentPurchase: {
        findMany: vi.fn().mockResolvedValue([{ id: "purch-1", name: "Laptop", numberOfTerms: 12 }]),
      },
    });
    const entries = await listCalendarEntries(prisma, "user-1", range, now);
    expect(entries).toContainEqual(
      expect.objectContaining({ sourceType: "INSTALLMENT", sourceId: "inst-1", amount: 100000, confidence: "CONFIRMED", state: "UPCOMING" }),
    );
  });
});

describe("listCalendarEntries — RECURRING_RULE", () => {
  it("maps a rule whose nextDate falls in range", async () => {
    const prisma = makeFakePrisma({
      recurringRule: {
        findMany: vi.fn().mockResolvedValue([{ id: "rule-1", name: "Netflix", amount: 55000, nextDate: d(2026, 9, 12), active: true }]),
      },
    });
    const entries = await listCalendarEntries(prisma, "user-1", range, now);
    expect(entries).toContainEqual(
      expect.objectContaining({ sourceType: "RECURRING_RULE", sourceId: "rule-1", label: "Netflix", confidence: "EXPECTED" }),
    );
  });
});

describe("listCalendarEntries — RECURRING_PAYABLE dedup", () => {
  it("excludes the RecurringPayable's own entry when a Payable already materialized it", async () => {
    const prisma = makeFakePrisma({
      payable: {
        findMany: vi.fn().mockResolvedValue([
          { id: "pay-1", name: "Rent", amount: 1500000, dueDate: d(2026, 9, 5), status: "PENDING", recurringPayableId: "rp-1" },
        ]),
      },
      recurringPayable: {
        findMany: vi.fn().mockResolvedValue([{ id: "rp-1", name: "Rent", amount: 1500000, nextDueDate: d(2026, 9, 5), active: true }]),
      },
    });
    const entries = await listCalendarEntries(prisma, "user-1", range, now);
    const recurringPayableEntries = entries.filter((e) => e.sourceType === "RECURRING_PAYABLE");
    expect(recurringPayableEntries).toHaveLength(0);
    expect(entries.filter((e) => e.sourceType === "PAYABLE")).toHaveLength(1);
  });

  it("includes the RecurringPayable's entry when no matching Payable exists yet", async () => {
    const prisma = makeFakePrisma({
      recurringPayable: {
        findMany: vi.fn().mockResolvedValue([{ id: "rp-1", name: "Rent", amount: 1500000, nextDueDate: d(2026, 9, 5), active: true }]),
      },
    });
    const entries = await listCalendarEntries(prisma, "user-1", range, now);
    expect(entries).toContainEqual(expect.objectContaining({ sourceType: "RECURRING_PAYABLE", sourceId: "rp-1" }));
  });
});

describe("listCalendarEntries — INCOME_FORECAST", () => {
  it("passes through the forecast's own confidence status", async () => {
    const prisma = makeFakePrisma({
      incomeForecast: {
        findMany: vi.fn().mockResolvedValue([
          { id: "fc-1", source: "MY_SALARY", expectedAmount: 3500000, expectedDate: d(2026, 9, 15), status: "ESTIMATED", actualTransactionId: null },
        ]),
      },
    });
    const entries = await listCalendarEntries(prisma, "user-1", range, now);
    expect(entries).toContainEqual(expect.objectContaining({ sourceType: "INCOME_FORECAST", confidence: "ESTIMATED", state: "UPCOMING" }));
  });

  it("reports PAID once linked to a real transaction, never OVERDUE even if the date has passed", async () => {
    const prisma = makeFakePrisma({
      incomeForecast: {
        findMany: vi.fn().mockResolvedValue([
          { id: "fc-1", source: "MY_SALARY", expectedAmount: 3500000, expectedDate: d(2026, 9, 1), status: "EXPECTED", actualTransactionId: "txn-1" },
        ]),
      },
    });
    const entries = await listCalendarEntries(prisma, "user-1", range, now);
    expect(entries.find((e) => e.sourceType === "INCOME_FORECAST")?.state).toBe("PAID");
  });
});

describe("listCalendarEntries — SHOPPING_TRIP", () => {
  it("maps a list with a plannedDate", async () => {
    const prisma = makeFakePrisma({
      shoppingList: { findMany: vi.fn().mockResolvedValue([{ id: "list-1", name: "Weekly groceries", plannedDate: d(2026, 9, 18) }]) },
    });
    const entries = await listCalendarEntries(prisma, "user-1", range, now);
    expect(entries).toContainEqual(expect.objectContaining({ sourceType: "SHOPPING_TRIP", sourceId: "list-1", label: "Weekly groceries", amount: null }));
  });
});

describe("listCalendarEntries — YEAR_PLAN_PHASE", () => {
  it("maps a phase whose startDate falls in range", async () => {
    const prisma = makeFakePrisma({
      yearPlanPhase: {
        findMany: vi.fn().mockResolvedValue([{ id: "phase-1", phaseType: "HOME_SALARY_ONLY", label: null, startDate: d(2026, 9, 20) }]),
      },
    });
    const entries = await listCalendarEntries(prisma, "user-1", range, now);
    expect(entries).toContainEqual(expect.objectContaining({ sourceType: "YEAR_PLAN_PHASE", label: "HOME_SALARY_ONLY" }));
  });
});

describe("listCalendarEntries — CUSTOM_REMINDER", () => {
  it("maps a reminder in range", async () => {
    const prisma = makeFakePrisma({
      customReminder: {
        findMany: vi.fn().mockResolvedValue([{ id: "rem-1", label: "Passport renewal", date: d(2026, 9, 22), amount: null, state: "UPCOMING" }]),
      },
    });
    const entries = await listCalendarEntries(prisma, "user-1", range, now);
    expect(entries).toContainEqual(expect.objectContaining({ sourceType: "CUSTOM_REMINDER", label: "Passport renewal" }));
  });
});

describe("listCalendarEntries — CREDIT_CARD projection", () => {
  it("projects statement and due dates for the range's month, clamping statementDay 31 in a 30-day month", async () => {
    const prisma = makeFakePrisma({
      creditCard: {
        findMany: vi.fn().mockResolvedValue([
          { id: "cc-1", accountId: "acc-1", statementDay: 31, paymentDueDay: 15, account: { name: "Rewards Card" } },
        ]),
      },
    });
    // September has 30 days -> statementDay 31 clamps to Sep 30.
    const entries = await listCalendarEntries(prisma, "user-1", range, now);
    const statement = entries.find((e) => e.sourceType === "CREDIT_CARD_STATEMENT");
    const due = entries.find((e) => e.sourceType === "CREDIT_CARD_DUE");
    expect(statement?.date).toEqual(d(2026, 9, 30));
    expect(due?.date).toEqual(d(2026, 9, 15));
  });
});

describe("listCalendarEntries — range boundary", () => {
  it("includes an entry exactly on range.start and range.end, excludes one day outside either edge", async () => {
    const prisma = makeFakePrisma({
      payable: {
        findMany: vi.fn().mockResolvedValue([
          { id: "pay-start", name: "On start", amount: 1000, dueDate: range.start, status: "PENDING" },
          { id: "pay-end", name: "On end", amount: 1000, dueDate: range.end, status: "PENDING" },
        ]),
      },
    });
    const entries = await listCalendarEntries(prisma, "user-1", range, now);
    expect(entries.map((e) => e.sourceId).sort()).toEqual(["pay-end", "pay-start"]);
  });
});

describe("listCalendarEntries — sorting", () => {
  it("returns entries sorted by date ascending", async () => {
    const prisma = makeFakePrisma({
      payable: {
        findMany: vi.fn().mockResolvedValue([
          { id: "pay-late", name: "Later", amount: 1000, dueDate: d(2026, 9, 25), status: "PENDING" },
          { id: "pay-early", name: "Earlier", amount: 1000, dueDate: d(2026, 9, 5), status: "PENDING" },
        ]),
      },
    });
    const entries = await listCalendarEntries(prisma, "user-1", range, now);
    expect(entries.map((e) => e.sourceId)).toEqual(["pay-early", "pay-late"]);
  });
});
