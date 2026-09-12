"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { loanSchema } from "@/lib/validations/loan";
import { archiveLoan, createLoan, makeLoanPayment, updateLoan } from "@/lib/loans";
import { toMinorUnits } from "@/lib/money";

export type LoanActionResult = { ok: true } | { ok: false; error: string };

const LOAN_CURRENCY = "PHP"; // loans aren't linked to an Account, so there's no per-loan currency yet

function parseLoanForm(formData: FormData) {
  return loanSchema.safeParse({
    name: formData.get("name"),
    principal: Number(formData.get("principal")),
    interestRate: Number(formData.get("interestRate")),
    monthlyPayment: Number(formData.get("monthlyPayment")),
    remainingBalance: Number(formData.get("remainingBalance")),
    startDate: new Date(String(formData.get("startDate"))),
  });
}

export async function createLoanAction(formData: FormData): Promise<LoanActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const parsed = parseLoanForm(formData);
  if (!parsed.success) return { ok: false, error: "Please check the loan details" };

  await createLoan(prisma, session.user.id, {
    ...parsed.data,
    principal: toMinorUnits(parsed.data.principal, LOAN_CURRENCY),
    monthlyPayment: toMinorUnits(parsed.data.monthlyPayment, LOAN_CURRENCY),
    remainingBalance: toMinorUnits(parsed.data.remainingBalance, LOAN_CURRENCY),
  });

  revalidatePath("/loans-cards");
  return { ok: true };
}

export async function updateLoanAction(loanId: string, formData: FormData): Promise<LoanActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const parsed = parseLoanForm(formData);
  if (!parsed.success) return { ok: false, error: "Please check the loan details" };

  const result = await updateLoan(prisma, session.user.id, loanId, {
    ...parsed.data,
    principal: toMinorUnits(parsed.data.principal, LOAN_CURRENCY),
    monthlyPayment: toMinorUnits(parsed.data.monthlyPayment, LOAN_CURRENCY),
    remainingBalance: toMinorUnits(parsed.data.remainingBalance, LOAN_CURRENCY),
  });

  if (result.ok) revalidatePath("/loans-cards");
  return result;
}

export async function archiveLoanAction(loanId: string): Promise<LoanActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const result = await archiveLoan(prisma, session.user.id, loanId);
  if (result.ok) revalidatePath("/loans-cards");
  return result;
}

export async function makeLoanPaymentAction(
  loanId: string,
  formData: FormData,
): Promise<LoanActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.user.id } });

  const accountId = String(formData.get("accountId"));
  const account = await prisma.account.findUniqueOrThrow({ where: { id: accountId } });
  const amount = toMinorUnits(Number(formData.get("amount")), account.currency);
  const date = new Date(String(formData.get("date")));

  const result = await makeLoanPayment(prisma, user.id, user.cycleStartDay, loanId, {
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
