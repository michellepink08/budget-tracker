"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { ROLLOVER_MODES } from "@/lib/constants/financial";
import { createAllocation, deleteAllocation, updateAllocation } from "@/lib/budget-allocations";
import { createBudgetPeriod } from "@/lib/budget-periods";
import { acknowledgeRollover } from "@/lib/cutoff-rollover";
import { computeDisposableTotal } from "@/lib/purpose-totals";
import { toMinorUnits } from "@/lib/money";
import { assertUnderDemoCap } from "@/lib/demo-guard";

export type BudgetActionResult = { ok: true } | { ok: false; error: string };

const allocationSchema = z.object({
  budgetPeriodId: z.string().min(1),
  categoryId: z.string().min(1),
  subcategoryId: z.string().optional(),
  plannedAmount: z.number().positive("Planned amount must be greater than zero"),
  rolloverMode: z.enum(ROLLOVER_MODES),
  showDailyAllowance: z.boolean(),
});

export async function createAllocationAction(formData: FormData): Promise<BudgetActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.user.id } });

  const parsed = allocationSchema.safeParse({
    budgetPeriodId: formData.get("budgetPeriodId"),
    categoryId: formData.get("categoryId"),
    subcategoryId: formData.get("subcategoryId") || undefined,
    plannedAmount: Number(formData.get("plannedAmount")),
    rolloverMode: formData.get("rolloverMode"),
    showDailyAllowance: formData.get("showDailyAllowance") === "true",
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
    subcategoryId: parsed.data.subcategoryId ?? null,
    plannedAmount: toMinorUnits(parsed.data.plannedAmount, user.currency),
  });
  if (!result.ok) return result;

  revalidatePath("/budget");
  revalidatePath("/dashboard");
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
      showDailyAllowance: z.boolean(),
    })
    .safeParse({
      plannedAmount: Number(formData.get("plannedAmount")),
      rolloverMode: formData.get("rolloverMode"),
      showDailyAllowance: formData.get("showDailyAllowance") === "true",
    });
  if (!parsed.success) return { ok: false, error: "Please check the allocation details" };

  const result = await updateAllocation(prisma, user.id, allocationId, {
    ...parsed.data,
    plannedAmount: toMinorUnits(parsed.data.plannedAmount, user.currency),
  });

  if (result.ok) {
    revalidatePath("/budget");
    revalidatePath("/dashboard");
  }
  return result;
}

export async function deleteAllocationAction(allocationId: string): Promise<BudgetActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const result = await deleteAllocation(prisma, session.user.id, allocationId);

  if (result.ok) {
    revalidatePath("/budget");
    revalidatePath("/dashboard");
  }
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

export async function acknowledgeRolloverAction(periodId: string): Promise<BudgetActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.user.id } });

  const amount = await computeDisposableTotal(prisma, user.id);
  const result = await acknowledgeRollover(prisma, user.id, periodId, amount);
  if (!result.ok) return result;

  revalidatePath("/dashboard");
  revalidatePath("/budget");
  revalidatePath("/ledger");
  return { ok: true };
}
