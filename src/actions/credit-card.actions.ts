"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { creditCardSchema } from "@/lib/validations/credit-card";
import { createCreditCard, makeCreditCardPayment, updateCreditCard } from "@/lib/credit-cards";
import { toMinorUnits } from "@/lib/money";

export type CreditCardActionResult = { ok: true } | { ok: false; error: string };

function parseCreditCardForm(formData: FormData) {
  return creditCardSchema.safeParse({
    accountId: formData.get("accountId"),
    creditLimit: Number(formData.get("creditLimit")),
    statementDay: Number(formData.get("statementDay")),
    paymentDueDay: Number(formData.get("paymentDueDay")),
    interestRate: Number(formData.get("interestRate")),
  });
}

export async function createCreditCardAction(formData: FormData): Promise<CreditCardActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const parsed = parseCreditCardForm(formData);
  if (!parsed.success) return { ok: false, error: "Please check the credit card details" };

  const account = await prisma.account.findUniqueOrThrow({ where: { id: parsed.data.accountId } });

  await createCreditCard(prisma, session.user.id, {
    ...parsed.data,
    creditLimit: toMinorUnits(parsed.data.creditLimit, account.currency),
  });

  revalidatePath("/loans-cards");
  return { ok: true };
}

export async function updateCreditCardAction(
  creditCardId: string,
  formData: FormData,
): Promise<CreditCardActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const parsed = parseCreditCardForm(formData);
  if (!parsed.success) return { ok: false, error: "Please check the credit card details" };

  const account = await prisma.account.findUniqueOrThrow({ where: { id: parsed.data.accountId } });

  const result = await updateCreditCard(prisma, session.user.id, creditCardId, {
    ...parsed.data,
    creditLimit: toMinorUnits(parsed.data.creditLimit, account.currency),
  });

  if (result.ok) revalidatePath("/loans-cards");
  return result;
}

export async function makeCreditCardPaymentAction(
  creditCardId: string,
  formData: FormData,
): Promise<CreditCardActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.user.id } });

  const accountId = String(formData.get("accountId"));
  const account = await prisma.account.findUniqueOrThrow({ where: { id: accountId } });
  const amount = toMinorUnits(Number(formData.get("amount")), account.currency);
  const date = new Date(String(formData.get("date")));

  const result = await makeCreditCardPayment(prisma, user.id, user.cycleStartDay, creditCardId, {
    accountId,
    amount,
    date,
  });

  if (result.ok) {
    revalidatePath("/loans-cards");
    revalidatePath("/transactions");
    revalidatePath("/accounts");
  }
  return result;
}
