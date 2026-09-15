"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { lendingSchema } from "@/lib/validations/lending";
import {
  archiveLending,
  createLending,
  markLendingReturned,
  recordLendingRepayment,
  resolveOrCreateLendingSubcategory,
  updateLending,
} from "@/lib/lending";
import { toMinorUnits } from "@/lib/money";
import { assertOwnedAccount } from "@/lib/accounts";
import { assertUnderDemoCap } from "@/lib/demo-guard";

export type LendingActionResult = { ok: true } | { ok: false; error: string };

const LENDING_CURRENCY = "PHP"; // item lends aren't linked to an Account, so there's no per-item currency

function parseLendingForm(formData: FormData) {
  const kind = formData.get("kind");
  if (kind === "ITEM") {
    const rawItemValue = formData.get("itemValue");
    return lendingSchema.safeParse({
      kind: "ITEM",
      borrowerName: formData.get("borrowerName"),
      itemDescription: formData.get("itemDescription"),
      itemValue: rawItemValue ? Number(rawItemValue) : undefined,
      date: new Date(String(formData.get("date"))),
    });
  }
  return lendingSchema.safeParse({
    kind: "CASH",
    borrowerName: formData.get("borrowerName"),
    amount: Number(formData.get("amount")),
    accountId: formData.get("accountId"),
    date: new Date(String(formData.get("date"))),
  });
}

export async function createLendingAction(formData: FormData): Promise<LendingActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };
  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.user.id } });

  const parsed = parseLendingForm(formData);
  if (!parsed.success) return { ok: false, error: "Please check the lending details" };

  const capResult = await assertUnderDemoCap(
    prisma,
    user.id,
    () => prisma.lending.count({ where: { userId: user.id } }),
    100,
  );
  if (capResult) return capResult;

  const { categoryId, subcategoryId } = await resolveOrCreateLendingSubcategory(
    prisma,
    user.id,
    parsed.data.borrowerName,
  );

  if (parsed.data.kind === "CASH") {
    const account = await assertOwnedAccount(prisma, user.id, parsed.data.accountId);
    if (!account) return { ok: false, error: "Account not found" };

    await createLending(prisma, user.id, user.cycleStartDay, {
      borrowerName: parsed.data.borrowerName,
      kind: "CASH",
      amount: toMinorUnits(parsed.data.amount, account.currency),
      accountId: parsed.data.accountId,
      date: parsed.data.date,
      categoryId,
      subcategoryId,
    });
  } else {
    await createLending(prisma, user.id, user.cycleStartDay, {
      borrowerName: parsed.data.borrowerName,
      kind: "ITEM",
      itemDescription: parsed.data.itemDescription,
      itemValue:
        parsed.data.itemValue !== undefined ? toMinorUnits(parsed.data.itemValue, LENDING_CURRENCY) : undefined,
      date: parsed.data.date,
      categoryId,
      subcategoryId,
    });
  }

  revalidatePath("/lending");
  revalidatePath("/transactions");
  revalidatePath("/budget");
  return { ok: true };
}

export async function updateLendingAction(lendingId: string, formData: FormData): Promise<LendingActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const parsed = parseLendingForm(formData);
  if (!parsed.success) return { ok: false, error: "Please check the lending details" };

  const result =
    parsed.data.kind === "CASH"
      ? await updateLending(prisma, session.user.id, lendingId, {
          borrowerName: parsed.data.borrowerName,
          amount: toMinorUnits(parsed.data.amount, LENDING_CURRENCY),
          accountId: parsed.data.accountId,
          date: parsed.data.date,
        })
      : await updateLending(prisma, session.user.id, lendingId, {
          borrowerName: parsed.data.borrowerName,
          itemDescription: parsed.data.itemDescription,
          itemValue:
            parsed.data.itemValue !== undefined ? toMinorUnits(parsed.data.itemValue, LENDING_CURRENCY) : undefined,
          date: parsed.data.date,
        });

  if (result.ok) {
    revalidatePath("/lending");
  }
  return result;
}

export async function archiveLendingAction(lendingId: string): Promise<LendingActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const result = await archiveLending(prisma, session.user.id, lendingId);
  if (result.ok) revalidatePath("/lending");
  return result;
}

export async function markLendingReturnedAction(lendingId: string): Promise<LendingActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const result = await markLendingReturned(prisma, session.user.id, lendingId);
  if (result.ok) revalidatePath("/lending");
  return result;
}

export async function recordLendingRepaymentAction(
  lendingId: string,
  formData: FormData,
): Promise<LendingActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };
  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.user.id } });

  const accountId = String(formData.get("accountId"));
  const account = await assertOwnedAccount(prisma, user.id, accountId);
  if (!account) return { ok: false, error: "Account not found" };
  const amount = toMinorUnits(Number(formData.get("amount")), account.currency);
  const date = new Date(String(formData.get("date")));

  const result = await recordLendingRepayment(prisma, user.id, user.cycleStartDay, lendingId, {
    accountId,
    amount,
    date,
  });

  if (result.ok) {
    revalidatePath("/lending");
    revalidatePath("/transactions");
    revalidatePath("/accounts");
    revalidatePath("/budget");
  }
  return result;
}
