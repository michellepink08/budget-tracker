"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { payableSchema } from "@/lib/validations/payable";
import { createPayable, markPayablePaid, updatePayable } from "@/lib/payables";
import { toMinorUnits } from "@/lib/money";

export type PayableActionResult = { ok: true } | { ok: false; error: string };

function parsePayableForm(formData: FormData) {
  return payableSchema.safeParse({
    name: formData.get("name"),
    amount: Number(formData.get("amount")),
    dueDate: new Date(String(formData.get("dueDate"))),
    accountId: formData.get("accountId"),
    categoryId: formData.get("categoryId") || undefined,
  });
}

export async function createPayableAction(formData: FormData): Promise<PayableActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const parsed = parsePayableForm(formData);
  if (!parsed.success) return { ok: false, error: "Please check the bill details" };

  const account = await prisma.account.findUniqueOrThrow({ where: { id: parsed.data.accountId } });

  await createPayable(prisma, session.user.id, {
    ...parsed.data,
    amount: toMinorUnits(parsed.data.amount, account.currency),
  });

  revalidatePath("/bills");
  return { ok: true };
}

export async function updatePayableAction(
  payableId: string,
  formData: FormData,
): Promise<PayableActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const account = await prisma.account.findFirst({ where: { id: String(formData.get("accountId")) } });
  const currency = account?.currency ?? "PHP";

  const parsed = parsePayableForm(formData);
  if (!parsed.success) return { ok: false, error: "Please check the bill details" };

  const result = await updatePayable(prisma, session.user.id, payableId, {
    ...parsed.data,
    amount: toMinorUnits(parsed.data.amount, currency),
  });

  if (result.ok) revalidatePath("/bills");
  return result;
}

export async function markPayablePaidAction(
  payableId: string,
  formData: FormData,
): Promise<PayableActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.user.id } });

  const overrideAmountRaw = formData.get("amount");
  const overrideDateRaw = formData.get("date");

  let overrideAmount: number | undefined;
  if (overrideAmountRaw) {
    const payable = await prisma.payable.findFirst({ where: { id: payableId, userId: user.id } });
    if (payable) {
      const account = await prisma.account.findUniqueOrThrow({ where: { id: payable.accountId } });
      overrideAmount = toMinorUnits(Number(overrideAmountRaw), account.currency);
    }
  }

  const result = await markPayablePaid(prisma, user.id, user.cycleStartDay, payableId, {
    amount: overrideAmount,
    date: overrideDateRaw ? new Date(String(overrideDateRaw)) : undefined,
  });

  if (result.ok) {
    revalidatePath("/bills");
    revalidatePath("/transactions");
    revalidatePath("/accounts");
  }
  return result;
}
