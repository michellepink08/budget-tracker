"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { incomeForecastSchema, yearPlanPhaseSchema, yearPlanSchema } from "@/lib/validations/year-plan";
import {
  addIncomeForecast,
  addPhase,
  createYearPlan,
  deleteIncomeForecast,
  deletePhase,
  deleteYearPlan,
  updateIncomeForecast,
  updatePhase,
  updateYearPlan,
} from "@/lib/year-plan";
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

  const result = await createYearPlan(prisma, session.user.id, {
    ...parsed.data,
    minCashBuffer: toMinorUnits(parsed.data.minCashBuffer, currency),
  });
  if (!result.ok) return result;
  revalidatePath("/year-plan");
  return { ok: true };
}

export async function updateYearPlanAction(
  yearPlanId: string,
  currency: string,
  formData: FormData,
): Promise<YearPlanActionResult> {
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

  const result = await updateYearPlan(prisma, session.user.id, yearPlanId, {
    ...parsed.data,
    minCashBuffer: toMinorUnits(parsed.data.minCashBuffer, currency),
  });
  if (result.ok) revalidatePath("/year-plan");
  return result;
}

export async function deleteYearPlanAction(yearPlanId: string): Promise<YearPlanActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const result = await deleteYearPlan(prisma, session.user.id, yearPlanId);
  if (result.ok) revalidatePath("/year-plan");
  return result;
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

export async function updatePhaseAction(phaseId: string, currency: string, formData: FormData): Promise<YearPlanActionResult> {
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

  const result = await updatePhase(prisma, session.user.id, phaseId, {
    ...parsed.data,
    estimatedExpensesPerCutoff: toMinorUnits(parsed.data.estimatedExpensesPerCutoff, currency),
  });
  if (result.ok) revalidatePath("/year-plan");
  return result;
}

export async function deletePhaseAction(phaseId: string): Promise<YearPlanActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const result = await deletePhase(prisma, session.user.id, phaseId);
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

export async function updateIncomeForecastAction(
  forecastId: string,
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

  const result = await updateIncomeForecast(prisma, session.user.id, forecastId, {
    ...parsed.data,
    expectedAmount: toMinorUnits(parsed.data.expectedAmount, currency),
  });
  if (result.ok) revalidatePath("/year-plan");
  return result;
}

export async function deleteIncomeForecastAction(forecastId: string): Promise<YearPlanActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const result = await deleteIncomeForecast(prisma, session.user.id, forecastId);
  if (result.ok) revalidatePath("/year-plan");
  return result;
}
