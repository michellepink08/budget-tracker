import type { PrismaClient } from "@prisma/client";
import { resolveRolloverCarryIn } from "@/lib/rollover-carry-in";
import { computeCategoryActual } from "@/lib/category-actual";

export type AllocationInput = {
  budgetPeriodId: string;
  categoryId: string;
  plannedAmount: number; // minor units
  rolloverMode: string;
};

export type AllocationMutationResult = { ok: true } | { ok: false; error: string };

export async function createAllocation(
  prisma: Pick<PrismaClient, "budgetAllocation" | "budgetPeriod" | "transaction">,
  userId: string,
  input: AllocationInput,
) {
  const period = await prisma.budgetPeriod.findUniqueOrThrow({
    where: { id: input.budgetPeriodId },
  });

  const rolloverAmount = await resolveRolloverCarryIn(prisma, userId, input.categoryId, period.startDate);

  return prisma.budgetAllocation.create({
    data: { userId, ...input, rolloverAmount },
  });
}

export async function updateAllocation(
  prisma: Pick<PrismaClient, "budgetAllocation">,
  userId: string,
  allocationId: string,
  input: { plannedAmount?: number; rolloverMode?: string },
): Promise<AllocationMutationResult> {
  const result = await prisma.budgetAllocation.updateMany({
    where: { id: allocationId, userId },
    data: input,
  });
  if (result.count === 0) {
    return { ok: false, error: "Allocation not found" };
  }
  return { ok: true };
}

export type AllocationWithActual = {
  id: string;
  categoryId: string;
  category: { name: string };
  plannedAmount: number;
  rolloverAmount: number;
  rolloverMode: string;
  effectivePlanned: number;
  actual: number;
  remaining: number;
  percentUsed: number;
};

export async function listAllocationsWithActuals(
  prisma: Pick<PrismaClient, "budgetAllocation" | "transaction">,
  userId: string,
  budgetPeriodId: string,
): Promise<AllocationWithActual[]> {
  const allocations = await prisma.budgetAllocation.findMany({
    where: { userId, budgetPeriodId },
    include: { category: true },
  });

  return Promise.all(
    allocations.map(async (allocation) => {
      const effectivePlanned = allocation.plannedAmount + allocation.rolloverAmount;
      const actual = await computeCategoryActual(prisma, budgetPeriodId, allocation.categoryId);
      return {
        id: allocation.id,
        categoryId: allocation.categoryId,
        category: allocation.category,
        plannedAmount: allocation.plannedAmount,
        rolloverAmount: allocation.rolloverAmount,
        rolloverMode: allocation.rolloverMode,
        effectivePlanned,
        actual,
        remaining: effectivePlanned - actual,
        percentUsed: effectivePlanned === 0 ? 0 : (actual / effectivePlanned) * 100,
      };
    }),
  );
}
