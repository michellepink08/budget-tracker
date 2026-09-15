import type { PrismaClient } from "@prisma/client";
import { resolveRolloverCarryIn } from "@/lib/rollover-carry-in";
import { computeCategoryActual, computeSubcategoryActual } from "@/lib/category-actual";

export type AllocationInput = {
  budgetPeriodId: string;
  categoryId: string;
  subcategoryId: string | null;
  plannedAmount: number; // minor units
  rolloverMode: string;
  showDailyAllowance: boolean;
};

export type AllocationMutationResult = { ok: true } | { ok: false; error: string };

export type CreateAllocationResult = { ok: true; id: string } | { ok: false; error: string };

export async function createAllocation(
  prisma: Pick<PrismaClient, "budgetAllocation" | "budgetPeriod" | "category" | "subcategory" | "transaction">,
  userId: string,
  input: AllocationInput,
): Promise<CreateAllocationResult> {
  const period = await prisma.budgetPeriod.findFirst({
    where: { id: input.budgetPeriodId, userId },
  });
  if (!period) return { ok: false, error: "Budget period not found" };

  const category = await prisma.category.findFirst({
    where: { id: input.categoryId, userId },
  });
  if (!category) return { ok: false, error: "Category not found" };

  if (input.subcategoryId) {
    const subcategory = await prisma.subcategory.findFirst({
      where: { id: input.subcategoryId, userId, categoryId: input.categoryId },
    });
    if (!subcategory) return { ok: false, error: "Subcategory not found" };

    // Either/or per category, per cutoff: a whole-category row already
    // existing blocks adding subcategory-level ones alongside it.
    const wholeCategoryRow = await prisma.budgetAllocation.findFirst({
      where: { budgetPeriodId: input.budgetPeriodId, categoryId: input.categoryId, subcategoryId: null },
    });
    if (wholeCategoryRow) {
      return { ok: false, error: "This category already has a whole-category budget for this cutoff" };
    }
  } else {
    // Postgres treats multiple NULL subcategoryIds as distinct, so the DB
    // unique index alone can't stop a second whole-category row (or a
    // whole-category row alongside existing subcategory ones) — checked
    // here instead.
    const anyRow = await prisma.budgetAllocation.findFirst({
      where: { budgetPeriodId: input.budgetPeriodId, categoryId: input.categoryId },
    });
    if (anyRow) {
      return {
        ok: false,
        error: "This category already has a budget for this cutoff — remove it first to budget by subcategory",
      };
    }
  }

  const rolloverAmount = await resolveRolloverCarryIn(
    prisma,
    userId,
    input.categoryId,
    input.subcategoryId,
    period.startDate,
  );

  const allocation = await prisma.budgetAllocation.create({
    data: { userId, ...input, rolloverAmount },
  });
  return { ok: true, id: allocation.id };
}

export async function updateAllocation(
  prisma: Pick<PrismaClient, "budgetAllocation">,
  userId: string,
  allocationId: string,
  input: { plannedAmount?: number; rolloverMode?: string; showDailyAllowance?: boolean },
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

export async function deleteAllocation(
  prisma: Pick<PrismaClient, "budgetAllocation">,
  userId: string,
  allocationId: string,
): Promise<AllocationMutationResult> {
  const result = await prisma.budgetAllocation.deleteMany({
    where: { id: allocationId, userId },
  });
  if (result.count === 0) {
    return { ok: false, error: "Allocation not found" };
  }
  return { ok: true };
}

export type AllocationWithActual = {
  id: string;
  categoryId: string;
  subcategoryId: string | null;
  category: { name: string };
  subcategoryName: string | null;
  plannedAmount: number;
  rolloverAmount: number;
  rolloverMode: string;
  showDailyAllowance: boolean;
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
    include: { category: true, subcategory: true },
  });

  return Promise.all(
    allocations.map(async (allocation) => {
      const effectivePlanned = allocation.plannedAmount + allocation.rolloverAmount;
      const actual = allocation.subcategoryId
        ? await computeSubcategoryActual(prisma, budgetPeriodId, allocation.subcategoryId)
        : await computeCategoryActual(prisma, budgetPeriodId, allocation.categoryId);
      return {
        id: allocation.id,
        categoryId: allocation.categoryId,
        subcategoryId: allocation.subcategoryId,
        category: allocation.category,
        subcategoryName: allocation.subcategory?.name ?? null,
        plannedAmount: allocation.plannedAmount,
        rolloverAmount: allocation.rolloverAmount,
        rolloverMode: allocation.rolloverMode,
        showDailyAllowance: allocation.showDailyAllowance,
        effectivePlanned,
        actual,
        remaining: effectivePlanned - actual,
        percentUsed: effectivePlanned === 0 ? 0 : (actual / effectivePlanned) * 100,
      };
    }),
  );
}

export type CategoryWithSubcategories = { id: string; name: string; subcategories: { id: string; name: string }[] };
export type AvailableAllocationOption = {
  id: string;
  name: string;
  canWholeCategory: boolean;
  availableSubcategories: { id: string; name: string }[];
};

// Drives the "what can I still add a budget for?" dropdown. A category
// drops out entirely once nothing is left to budget for it: either it
// already has a whole-category row, or every one of its subcategories is
// already individually allocated and it has no whole-category option left
// either (blocked the moment any sibling subcategory got its own row).
export function computeAvailableAllocationOptions(
  categories: CategoryWithSubcategories[],
  existingAllocations: { categoryId: string; subcategoryId: string | null }[],
): AvailableAllocationOption[] {
  const wholeCategoryTaken = new Set(
    existingAllocations.filter((a) => a.subcategoryId === null).map((a) => a.categoryId),
  );
  const hasAnyAllocation = new Set(existingAllocations.map((a) => a.categoryId));
  const takenSubcategoryIds = new Set(
    existingAllocations.filter((a) => a.subcategoryId !== null).map((a) => a.subcategoryId as string),
  );

  return categories
    .filter((c) => !wholeCategoryTaken.has(c.id))
    .map((c) => ({
      id: c.id,
      name: c.name,
      canWholeCategory: !hasAnyAllocation.has(c.id),
      availableSubcategories: c.subcategories.filter((s) => !takenSubcategoryIds.has(s.id)),
    }))
    .filter((c) => c.canWholeCategory || c.availableSubcategories.length > 0);
}
