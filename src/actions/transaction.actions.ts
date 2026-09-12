"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { transactionSchema, transferSchema } from "@/lib/validations/transaction";
import {
  createExpenseLikeTransaction,
  createTransferTransaction,
  deleteTransaction,
  updateTransaction,
} from "@/lib/transactions";
import { toMinorUnits } from "@/lib/money";

export type TransactionActionResult = { ok: true } | { ok: false; error: string };

async function currentUser() {
  const session = await auth();
  if (!session?.user) return null;
  return prisma.user.findUniqueOrThrow({ where: { id: session.user.id } });
}

export async function createTransactionAction(
  formData: FormData,
): Promise<TransactionActionResult> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "You must be logged in" };

  const parsed = transactionSchema.safeParse({
    type: formData.get("type"),
    amount: Number(formData.get("amount")),
    date: new Date(String(formData.get("date"))),
    accountId: formData.get("accountId"),
    categoryId: formData.get("categoryId") || undefined,
    subcategoryId: formData.get("subcategoryId") || undefined,
    description: formData.get("description"),
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) return { ok: false, error: "Please check the transaction details" };

  const account = await prisma.account.findUniqueOrThrow({ where: { id: parsed.data.accountId } });

  await createExpenseLikeTransaction(prisma, user.id, user.cycleStartDay, {
    ...parsed.data,
    amount: toMinorUnits(parsed.data.amount, account.currency),
  });

  revalidatePath("/transactions");
  return { ok: true };
}

export async function createTransferAction(formData: FormData): Promise<TransactionActionResult> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "You must be logged in" };

  const parsed = transferSchema.safeParse({
    amount: Number(formData.get("amount")),
    date: new Date(String(formData.get("date"))),
    sourceAccountId: formData.get("sourceAccountId"),
    destinationAccountId: formData.get("destinationAccountId"),
    description: formData.get("description"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the transfer details" };
  }

  const [source, destination] = await Promise.all([
    prisma.account.findUniqueOrThrow({ where: { id: parsed.data.sourceAccountId } }),
    prisma.account.findUniqueOrThrow({ where: { id: parsed.data.destinationAccountId } }),
  ]);

  if (source.currency !== destination.currency) {
    return { ok: false, error: "Transfers between different currencies aren't supported yet" };
  }

  await createTransferTransaction(prisma, user.id, user.cycleStartDay, {
    ...parsed.data,
    amount: toMinorUnits(parsed.data.amount, source.currency),
  });

  revalidatePath("/transactions");
  return { ok: true };
}

export async function updateTransactionAction(
  transactionId: string,
  formData: FormData,
): Promise<TransactionActionResult> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "You must be logged in" };

  const result = await updateTransaction(prisma, user.id, transactionId, {
    description: String(formData.get("description") ?? ""),
    notes: (formData.get("notes") as string) || undefined,
    categoryId: (formData.get("categoryId") as string) || null,
    subcategoryId: (formData.get("subcategoryId") as string) || null,
  });

  if (result.ok) revalidatePath("/transactions");
  return result;
}

export async function deleteTransactionAction(
  transactionId: string,
): Promise<TransactionActionResult> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "You must be logged in" };

  const result = await deleteTransaction(prisma, user.id, transactionId);
  if (result.ok) revalidatePath("/transactions");
  return result;
}
