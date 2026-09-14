"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { installmentPurchaseSchema } from "@/lib/validations/installment-purchase";
import {
  archiveInstallmentPurchase,
  createInstallmentPurchase,
  payInstallmentTerm,
} from "@/lib/installment-purchases";
import { toMinorUnits } from "@/lib/money";
import { assertOwnedAccount } from "@/lib/accounts";
import { assertOwnedCategory } from "@/lib/categories";

export type InstallmentActionResult = { ok: true } | { ok: false; error: string };

export async function createInstallmentPurchaseAction(
  formData: FormData,
): Promise<InstallmentActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const parsed = installmentPurchaseSchema.safeParse({
    name: formData.get("name"),
    totalAmount: Number(formData.get("totalAmount")),
    numberOfTerms: Number(formData.get("numberOfTerms")),
    accountId: formData.get("accountId"),
    categoryId: formData.get("categoryId") || undefined,
    startDate: new Date(String(formData.get("startDate"))),
  });
  if (!parsed.success) return { ok: false, error: "Please check the installment purchase details" };

  const account = await assertOwnedAccount(prisma, session.user.id, parsed.data.accountId);
  if (!account) return { ok: false, error: "Account not found" };
  if (parsed.data.categoryId && !(await assertOwnedCategory(prisma, session.user.id, parsed.data.categoryId))) {
    return { ok: false, error: "Category not found" };
  }

  await createInstallmentPurchase(prisma, session.user.id, {
    ...parsed.data,
    totalAmount: toMinorUnits(parsed.data.totalAmount, account.currency),
  });

  revalidatePath("/loans-cards");
  return { ok: true };
}

export async function archiveInstallmentPurchaseAction(
  purchaseId: string,
): Promise<InstallmentActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const result = await archiveInstallmentPurchase(prisma, session.user.id, purchaseId);
  if (result.ok) revalidatePath("/loans-cards");
  return result;
}

export async function payInstallmentTermAction(
  paymentId: string,
  formData: FormData,
): Promise<InstallmentActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.user.id } });

  const accountId = String(formData.get("accountId"));
  const account = await assertOwnedAccount(prisma, user.id, accountId);
  if (!account) return { ok: false, error: "Account not found" };

  const overrideAmountRaw = formData.get("amount");
  const overrideDateRaw = formData.get("date");

  const result = await payInstallmentTerm(prisma, user.id, user.cycleStartDay, paymentId, {
    accountId,
    amount: overrideAmountRaw ? toMinorUnits(Number(overrideAmountRaw), account.currency) : undefined,
    date: overrideDateRaw ? new Date(String(overrideDateRaw)) : undefined,
  });

  if (result.ok) {
    revalidatePath("/loans-cards");
    revalidatePath("/transactions");
    revalidatePath("/accounts");
  }
  return result;
}
