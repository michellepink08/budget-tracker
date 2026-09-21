"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { toMinorUnits } from "@/lib/money";
import { upsertCyclePaymentPlan } from "@/lib/cycle-payment-plans";

const schema = z.object({ budgetPeriodId: z.string().min(1), sourceType: z.enum(["LOAN", "CREDIT_CARD"]), sourceId: z.string().min(1), expectedAmount: z.number().min(0), dueDate: z.coerce.date().nullable(),dueDateStatus:z.enum(["CONFIRMED","ESTIMATED","UNSET"]),fundingAccountId:z.string().nullable().optional() });

export async function saveCyclePaymentPlanAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) return { ok: false as const, error: "You must be logged in" };
  const date=formData.get("dueDate");
  const parsed = schema.safeParse({ budgetPeriodId: formData.get("budgetPeriodId"), sourceType: formData.get("sourceType"), sourceId: formData.get("sourceId"), expectedAmount: Number(formData.get("expectedAmount")), dueDate:date||null,dueDateStatus:formData.get("dueDateStatus")||(date?"ESTIMATED":"UNSET"),...(formData.has("fundingAccountId")?{fundingAccountId:formData.get("fundingAccountId")||null}:{}) });
  if (!parsed.success) return { ok: false as const, error: "Please check the payment plan" };
  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.user.id } });
  const result = await upsertCyclePaymentPlan(prisma, user.id, { ...parsed.data, expectedAmount: toMinorUnits(parsed.data.expectedAmount, user.currency) });
  if (result.ok) for(const path of ["/budget","/dashboard","/calendar","/loans-cards"]) revalidatePath(path);
  return result;
}

export async function saveCyclePaymentPlanFormAction(formData: FormData): Promise<void> {
  await saveCyclePaymentPlanAction(formData);
}
