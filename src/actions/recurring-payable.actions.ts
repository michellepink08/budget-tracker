"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { recurringPayableSchema } from "@/lib/validations/recurring-payable";
import {
  confirmRecurringPayableOccurrence,
  createRecurringPayable,
  skipRecurringPayableOccurrence,
  updateRecurringPayable,
} from "@/lib/recurring-payables";
import { toMinorUnits } from "@/lib/money";
import { assertOwnedAccount } from "@/lib/accounts";
import { assertOwnedCategory } from "@/lib/categories";
import { assertUnderDemoCap } from "@/lib/demo-guard";

export type RecurringPayableActionResult = { ok: true } | { ok: false; error: string };

function parseRecurringPayableForm(formData: FormData) {
  return recurringPayableSchema.safeParse({
    name: formData.get("name"),
    amount: Number(formData.get("amount")),
    frequency: formData.get("frequency"),
    intervalDays: formData.get("intervalDays") ? Number(formData.get("intervalDays")) : undefined,
    nextDueDate: new Date(String(formData.get("nextDueDate"))),
    accountId: formData.get("accountId"),
    categoryId: formData.get("categoryId") || undefined,
  });
}

export async function createRecurringPayableAction(
  formData: FormData,
): Promise<RecurringPayableActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const parsed = parseRecurringPayableForm(formData);
  if (!parsed.success) return { ok: false, error: "Please check the recurring bill details" };

  const capResult = await assertUnderDemoCap(
    prisma,
    session.user.id,
    () => prisma.recurringPayable.count({ where: { userId: session.user.id } }),
    100,
  );
  if (capResult) return capResult;

  const account = await assertOwnedAccount(prisma, session.user.id, parsed.data.accountId);
  if (!account) return { ok: false, error: "Account not found" };
  if (parsed.data.categoryId && !(await assertOwnedCategory(prisma, session.user.id, parsed.data.categoryId))) {
    return { ok: false, error: "Category not found" };
  }

  await createRecurringPayable(prisma, session.user.id, {
    ...parsed.data,
    amount: toMinorUnits(parsed.data.amount, account.currency),
  });

  revalidatePath("/bills");
  return { ok: true };
}

export async function updateRecurringPayableAction(
  ruleId: string,
  formData: FormData,
): Promise<RecurringPayableActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const accountId = String(formData.get("accountId"));
  const account = await assertOwnedAccount(prisma, session.user.id, accountId);
  if (!account) return { ok: false, error: "Account not found" };
  const currency = account.currency;

  const parsed = parseRecurringPayableForm(formData);
  if (!parsed.success) return { ok: false, error: "Please check the recurring bill details" };
  if (parsed.data.categoryId && !(await assertOwnedCategory(prisma, session.user.id, parsed.data.categoryId))) {
    return { ok: false, error: "Category not found" };
  }

  const result = await updateRecurringPayable(prisma, session.user.id, ruleId, {
    ...parsed.data,
    amount: toMinorUnits(parsed.data.amount, currency),
  });

  if (result.ok) revalidatePath("/bills");
  return result;
}

export async function toggleRecurringPayableActiveAction(
  ruleId: string,
  active: boolean,
): Promise<RecurringPayableActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const result = await updateRecurringPayable(prisma, session.user.id, ruleId, { active });
  if (result.ok) revalidatePath("/bills");
  return result;
}

export async function confirmRecurringPayableOccurrenceAction(
  ruleId: string,
  formData: FormData,
): Promise<RecurringPayableActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const overrideAmountRaw = formData.get("amount");
  const overrideDateRaw = formData.get("dueDate");

  let overrideAmount: number | undefined;
  if (overrideAmountRaw) {
    const rule = await prisma.recurringPayable.findFirst({
      where: { id: ruleId, userId: session.user.id },
    });
    if (rule) {
      const account = await prisma.account.findUniqueOrThrow({ where: { id: rule.accountId } });
      overrideAmount = toMinorUnits(Number(overrideAmountRaw), account.currency);
    }
  }

  const result = await confirmRecurringPayableOccurrence(prisma, session.user.id, ruleId, {
    amount: overrideAmount,
    dueDate: overrideDateRaw ? new Date(String(overrideDateRaw)) : undefined,
  });

  if (result.ok) revalidatePath("/bills");
  return result;
}

export async function skipRecurringPayableOccurrenceAction(
  ruleId: string,
): Promise<RecurringPayableActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const result = await skipRecurringPayableOccurrence(prisma, session.user.id, ruleId);
  if (result.ok) revalidatePath("/bills");
  return result;
}
