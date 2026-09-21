"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { creditCardSchema } from "@/lib/validations/credit-card";
import { createCreditCard, makeCreditCardPayment, updateCreditCard } from "@/lib/credit-cards";
import { recordAudit } from "@/lib/audit-log";
import { toMinorUnits } from "@/lib/money";
import { assertOwnedAccount } from "@/lib/accounts";
import { assertUnderDemoCap } from "@/lib/demo-guard";

export type CreditCardActionResult = { ok: true } | { ok: false; error: string };

function parseCreditCardForm(formData: FormData) {
  return creditCardSchema.safeParse({
    accountId: formData.get("accountId"),
    creditLimit: Number(formData.get("creditLimit")),
    statementDay: Number(formData.get("statementDay")),
    paymentDueDay: Number(formData.get("paymentDueDay")),
    interestRate: Number(formData.get("interestRate")),
    monthlyInterestEstimate: formData.has("monthlyInterestEstimate")?Number(formData.get("monthlyInterestEstimate")):3,
  });
}

export async function createCreditCardAction(formData: FormData): Promise<CreditCardActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const parsed = parseCreditCardForm(formData);
  if (!parsed.success) return { ok: false, error: "Please check the credit card details" };

  const capResult = await assertUnderDemoCap(
    prisma,
    session.user.id,
    () => prisma.creditCard.count({ where: { userId: session.user.id } }),
    100,
  );
  if (capResult) return capResult;

  const account = await assertOwnedAccount(prisma, session.user.id, parsed.data.accountId);
  if (!account) return { ok: false, error: "Account not found" };

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

  const account = await assertOwnedAccount(prisma, session.user.id, parsed.data.accountId);
  if (!account) return { ok: false, error: "Account not found" };

  const result = await updateCreditCard(prisma, session.user.id, creditCardId, {
    ...parsed.data,
    creditLimit: toMinorUnits(parsed.data.creditLimit, account.currency),
  });

  if (result.ok) for(const path of ["/loans-cards","/budget","/dashboard","/calendar"]) revalidatePath(path);
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
  const account = await assertOwnedAccount(prisma, user.id, accountId);
  if (!account) return { ok: false, error: "Account not found" };
  const amount = toMinorUnits(Number(formData.get("amount")), account.currency);
  const date = new Date(String(formData.get("date")));

  const result = await prisma.$transaction(async (tx) => {
    const paymentResult = await makeCreditCardPayment(tx, user.id, user.cycleStartDay, creditCardId, {
      accountId,
      amount,
      date,
    });
    if (!paymentResult.ok) return paymentResult;
    await recordAudit(tx, {
      userId: user.id,
      entityType: "CREDIT_CARD_PAYMENT",
      entityId: paymentResult.transactionId,
      action: "CREATE",
      source: "FORM",
      newValues: { creditCardId, accountId, amount, date },
    });
    return paymentResult;
  });

  if (result.ok) {
    revalidatePath("/loans-cards");
    revalidatePath("/transactions");
    revalidatePath("/accounts");
    revalidatePath("/budget");
    revalidatePath("/dashboard");
    revalidatePath("/calendar");
  }
  return result;
}
