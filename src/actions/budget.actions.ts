"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { ROLLOVER_MODES } from "@/lib/constants/financial";
import { createAllocation, updateAllocation } from "@/lib/budget-allocations";
import { createBudgetPeriod } from "@/lib/budget-periods";
import { toMinorUnits } from "@/lib/money";
import { assertUnderDemoCap } from "@/lib/demo-guard";

export type BudgetActionResult = { ok: true } | { ok: false; error: string };

const allocationSchema = z.object({
  budgetPeriodId: z.string().min(1),
  categoryId: z.string().min(1),
  plannedAmount: z.number().positive("Planned amount must be greater than zero"),
  rolloverMode: z.enum(ROLLOVER_MODES),
});

export async function createAllocationAction(formData: FormData): Promise<BudgetActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.user.id } });

  const parsed = allocationSchema.safeParse({
    budgetPeriodId: formData.get("budgetPeriodId"),
    categoryId: formData.get("categoryId"),
    plannedAmount: Number(formData.get("plannedAmount")),
    rolloverMode: formData.get("rolloverMode"),
  });
  if (!parsed.success) return { ok: false, error: "Please check the allocation details" };

  const capResult = await assertUnderDemoCap(
    prisma,
    user.id,
    () => prisma.budgetAllocation.count({ where: { userId: user.id } }),
    100,
  );
  if (capResult) return capResult;

  const result = await createAllocation(prisma, user.id, {
    ...parsed.data,
    plannedAmount: toMinorUnits(parsed.data.plannedAmount, user.currency),
  });
  if (!result.ok) return result;

  revalidatePath("/budget");
  return { ok: true };
}

export async function updateAllocationAction(
  allocationId: string,
  formData: FormData,
): Promise<BudgetActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.user.id } });

  const parsed = z
    .object({
      plannedAmount: z.number().positive("Planned amount must be greater than zero"),
      rolloverMode: z.enum(ROLLOVER_MODES),
    })
    .safeParse({
      plannedAmount: Number(formData.get("plannedAmount")),
      rolloverMode: formData.get("rolloverMode"),
    });
  if (!parsed.success) return { ok: false, error: "Please check the allocation details" };

  const result = await updateAllocation(prisma, user.id, allocationId, {
    ...parsed.data,
    plannedAmount: toMinorUnits(parsed.data.plannedAmount, user.currency),
  });

  if (result.ok) revalidatePath("/budget");
  return result;
}

const periodSchema = z.object({
  name: z.string().min(1, "Name is required"),
  startDate: z.date(),
  endDate: z.date(),
});

export async function createBudgetPeriodAction(formData: FormData): Promise<BudgetActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const parsed = periodSchema.safeParse({
    name: formData.get("name"),
    startDate: new Date(String(formData.get("startDate"))),
    endDate: new Date(String(formData.get("endDate"))),
  });
  if (!parsed.success) return { ok: false, error: "Please check the period details" };

  if (parsed.data.endDate <= parsed.data.startDate) {
    return { ok: false, error: "End date must be after start date" };
  }

  const capResult = await assertUnderDemoCap(
    prisma,
    session.user.id,
    () => prisma.budgetPeriod.count({ where: { userId: session.user.id } }),
    100,
  );
  if (capResult) return capResult;

  const result = await createBudgetPeriod(prisma, session.user.id, { ...parsed.data, status: "UPCOMING" });
  if (!result.ok) return result;

  revalidatePath("/budget");
  return { ok: true };
}
