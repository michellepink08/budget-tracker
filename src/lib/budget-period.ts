import type { PrismaClient } from "@prisma/client";
import { formatCycleRange, getCycleForDate } from "@/lib/cycle";

// Finds the BudgetPeriod for the cycle containing `date`, creating one if
// it doesn't exist yet. Manual override (letting a user reassign a
// transaction to a different period than its date would auto-suggest) is
// not this function's concern — callers can pass an explicit
// budgetPeriodId directly instead of calling this resolver.
export async function resolveBudgetPeriodForDate(
  prisma: Pick<PrismaClient, "budgetPeriod">,
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

  return prisma.budgetPeriod.create({
    data: {
      userId,
      name: formatCycleRange({ start, end }),
      startDate: start,
      endDate: end,
      status: "ACTIVE",
    },
  });
}
