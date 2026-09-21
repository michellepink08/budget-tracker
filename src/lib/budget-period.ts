import type { PrismaClient } from "@prisma/client";
import {randomUUID} from "node:crypto";
import { formatCycleRange, getCycleForDate } from "@/lib/cycle";
import { materializeRecurringAllocations } from "@/lib/recurring-allocations";

// Finds the BudgetPeriod for the cycle containing `date`, creating one if
// it doesn't exist yet. Manual override (letting a user reassign a
// transaction to a different period than its date would auto-suggest) is
// not this function's concern — callers can pass an explicit
// budgetPeriodId directly instead of calling this resolver.
export async function resolveBudgetPeriodForDate(
  prisma: Pick<
    PrismaClient,
    "budgetPeriod" | "loan" | "recurringPayable" | "budgetAllocation" | "category" | "subcategory" | "transaction"
  >,
  userId: string,
  date: Date,
  cycleStartDay: number,
) {
  const { start, end } = getCycleForDate(cycleStartDay, date);

  const existing = await prisma.budgetPeriod.findUnique({
    where: { userId_startDate: { userId, startDate: start } },
  });
  if (existing) {
    return existing;
  }

  const candidateId = randomUUID();
  const period = await prisma.budgetPeriod.upsert({
    where: {userId_startDate:{userId,startDate:start}},
    // A same-value scalar update permits database-native ON CONFLICT.
    update: {startDate:start},
    create: {
      id: candidateId,
      userId,
      name: formatCycleRange({ start, end }),
      startDate: start,
      endDate: end,
      status: "ACTIVE",
    },
  });

  if (period.id === candidateId) await materializeRecurringAllocations(prisma, userId, period.id);

  return period;
}

export async function assertOwnedBudgetPeriod(
  prisma: Pick<PrismaClient, "budgetPeriod">,
  userId: string,
  budgetPeriodId: string,
): Promise<boolean> {
  const period = await prisma.budgetPeriod.findFirst({ where: { id: budgetPeriodId, userId } });
  return period !== null;
}
