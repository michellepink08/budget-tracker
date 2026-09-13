"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { accountSchema } from "@/lib/validations/account";
import { archiveAccount, createAccount, updateAccount } from "@/lib/accounts";
import { toMinorUnits } from "@/lib/money";

export type AccountActionResult = { ok: true } | { ok: false; error: string };

function parseAccountForm(formData: FormData) {
  return accountSchema.safeParse({
    name: formData.get("name"),
    accountType: formData.get("accountType"),
    openingBalance: Number(formData.get("openingBalance")),
    currency: formData.get("currency"),
    purpose: formData.get("purpose"),
    isPrimaryFundingAccount: formData.get("isPrimaryFundingAccount") === "true",
    color: formData.get("color"),
    icon: formData.get("icon"),
  });
}

export async function createAccountAction(formData: FormData): Promise<AccountActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const parsed = parseAccountForm(formData);
  if (!parsed.success) return { ok: false, error: "Please check the account details" };

  await createAccount(prisma, session.user.id, {
    ...parsed.data,
    openingBalance: toMinorUnits(parsed.data.openingBalance, parsed.data.currency),
  });

  revalidatePath("/accounts");
  return { ok: true };
}

export async function updateAccountAction(
  accountId: string,
  formData: FormData,
): Promise<AccountActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const parsed = parseAccountForm(formData);
  if (!parsed.success) return { ok: false, error: "Please check the account details" };

  const result = await updateAccount(prisma, session.user.id, accountId, {
    ...parsed.data,
    openingBalance: toMinorUnits(parsed.data.openingBalance, parsed.data.currency),
  });

  if (result.ok) revalidatePath("/accounts");
  return result;
}

export async function archiveAccountAction(accountId: string): Promise<AccountActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const result = await archiveAccount(prisma, session.user.id, accountId);
  if (result.ok) revalidatePath("/accounts");
  return result;
}
