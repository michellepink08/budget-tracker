"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { toMinorUnits } from "@/lib/money";
import { createCycleIncomePlan, deleteCycleIncomePlan, linkCycleIncomeActual, updateCycleIncomePlan } from "@/lib/cycle-income-plans";

async function currentUser() { const session = await auth(); if (!session?.user?.id) return null; return prisma.user.findUnique({ where: { id: session.user.id } }); }
export async function createCycleIncomePlanAction(formData: FormData) {
  const user = await currentUser(); if (!user) return { ok: false as const, error: "You must be logged in" };
  const source = String(formData.get("source") ?? "").trim(); const amount = Number(formData.get("expectedAmount")); const expectedDate = new Date(String(formData.get("expectedDate")));
  if (!source || !Number.isFinite(amount) || Number.isNaN(expectedDate.getTime())) return { ok: false as const, error: "Please enter a source, amount, and date" };
  const result = await createCycleIncomePlan(prisma, user.id, { budgetPeriodId: String(formData.get("budgetPeriodId")), source, expectedAmount: toMinorUnits(amount, user.currency), expectedDate, notes: null });
  if (result.ok) revalidatePath("/budget"); return result;
}
export async function updateCycleIncomePlanAction(id: string, formData: FormData) {
  const user = await currentUser(); if (!user) return { ok: false as const, error: "You must be logged in" };
  const result = await updateCycleIncomePlan(prisma, user.id, id, { source: String(formData.get("source") ?? "").trim(), expectedAmount: toMinorUnits(Number(formData.get("expectedAmount")), user.currency), expectedDate: new Date(String(formData.get("expectedDate"))) });
  if (result.ok) revalidatePath("/budget"); return result;
}
export async function deleteCycleIncomePlanAction(id: string) { const user = await currentUser(); if (!user) return { ok: false as const, error: "You must be logged in" }; const result = await deleteCycleIncomePlan(prisma, user.id, id); if (result.ok) revalidatePath("/budget"); return result; }
export async function linkCycleIncomeActualAction(id: string, transactionId: string) { const user = await currentUser(); if (!user) return { ok: false as const, error: "You must be logged in" }; const result = await linkCycleIncomeActual(prisma, user.id, id, transactionId); if (result.ok) revalidatePath("/budget"); return result; }
