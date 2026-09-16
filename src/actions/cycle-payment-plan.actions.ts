"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { toMinorUnits } from "@/lib/money";
import { upsertCyclePaymentPlan } from "@/lib/cycle-payment-plans";

const schema = z.object({ budgetPeriodId: z.string().min(1), sourceType: z.enum(["LOAN", "CREDIT_CARD"]), sourceId: z.string().min(1), expectedAmount: z.number().min(0), dueDate: z.coerce.date() });

export async function saveCyclePaymentPlanAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) return { ok: false as const, error: "You must be logged in" };
  const parsed = schema.safeParse({ budgetPeriodId: formData.get("budgetPeriodId"), sourceType: formData.get("sourceType"), sourceId: formData.get("sourceId"), expectedAmount: Number(formData.get("expectedAmount")), dueDate: formData.get("dueDate") });
  if (!parsed.success) return { ok: false as const, error: "Please check the payment plan" };
  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.user.id } });
  const result = await upsertCyclePaymentPlan(prisma, user.id, { ...parsed.data, expectedAmount: toMinorUnits(parsed.data.expectedAmount, user.currency) });
  if (result.ok) revalidatePath("/budget");
  return result;
}

export async function saveCyclePaymentPlanFormAction(formData: FormData): Promise<void> {
  await saveCyclePaymentPlanAction(formData);
}
