"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { incomeForecastSchema, yearPlanPhaseSchema, yearPlanSchema } from "@/lib/validations/year-plan";
import { addIncomeForecast, addPhase, createYearPlan } from "@/lib/year-plan";
import { toMinorUnits } from "@/lib/money";

export type YearPlanActionResult = { ok: true } | { ok: false; error: string };

export async function createYearPlanAction(currency: string, formData: FormData): Promise<YearPlanActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const parsed = yearPlanSchema.safeParse({
    name: formData.get("name"),
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
    minCashBuffer: Number(formData.get("minCashBuffer")),
    vacationReserveGoalId: formData.get("vacationReserveGoalId") || null,
  });
  if (!parsed.success) return { ok: false, error: "Please check the plan details" };

  await createYearPlan(prisma, session.user.id, {
    ...parsed.data,
    minCashBuffer: toMinorUnits(parsed.data.minCashBuffer, currency),
  });
  revalidatePath("/year-plan");
  return { ok: true };
}

export async function addPhaseAction(
  yearPlanId: string,
  currency: string,
  formData: FormData,
): Promise<YearPlanActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const parsed = yearPlanPhaseSchema.safeParse({
    phaseType: formData.get("phaseType"),
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
    label: formData.get("label") || null,
    estimatedExpensesPerCutoff: Number(formData.get("estimatedExpensesPerCutoff")),
  });
  if (!parsed.success) return { ok: false, error: "Please check the phase details" };

  const result = await addPhase(prisma, session.user.id, yearPlanId, {
    ...parsed.data,
    estimatedExpensesPerCutoff: toMinorUnits(parsed.data.estimatedExpensesPerCutoff, currency),
  });
  if (result.ok) revalidatePath("/year-plan");
  return result;
}

export async function addIncomeForecastAction(
  yearPlanId: string,
  currency: string,
  formData: FormData,
): Promise<YearPlanActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const parsed = incomeForecastSchema.safeParse({
    phaseId: formData.get("phaseId") || null,
    source: formData.get("source"),
    expectedDate: formData.get("expectedDate"),
    expectedAmount: Number(formData.get("expectedAmount")),
    cutoffLabel: formData.get("cutoffLabel"),
    status: formData.get("status"),
    notes: formData.get("notes") || null,
  });
  if (!parsed.success) return { ok: false, error: "Please check the forecast details" };

  const result = await addIncomeForecast(prisma, session.user.id, yearPlanId, {
    ...parsed.data,
    expectedAmount: toMinorUnits(parsed.data.expectedAmount, currency),
  });
  if (result.ok) revalidatePath("/year-plan");
  return result;
}
