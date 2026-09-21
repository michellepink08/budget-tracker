import type { PrismaClient } from "@prisma/client";
import {validateDueDate, type DueDateStatus} from "@/lib/financial-obligations";

export type CyclePaymentPlanSourceType = "LOAN" | "CREDIT_CARD";

export type CyclePaymentPlanInput = {
  budgetPeriodId: string;
  sourceType: CyclePaymentPlanSourceType;
  sourceId: string;
  expectedAmount: number;
  dueDate: Date | null;
  dueDateStatus?: DueDateStatus;
  fundingAccountId?: string | null;
};

type CyclePaymentPlanPrisma = Pick<
  PrismaClient,
  "budgetPeriod" | "loan" | "creditCard" | "cyclePaymentPlan" | "account"
>;

export async function listCyclePaymentPlans(
  prisma: Pick<PrismaClient, "cyclePaymentPlan">,
  userId: string,
  budgetPeriodId: string,
) {
  return prisma.cyclePaymentPlan.findMany({ where: { userId, budgetPeriodId }, include:{payments:{include:{transaction:true}},fundingAccount:true} });
}

export async function upsertCyclePaymentPlan(
  prisma: CyclePaymentPlanPrisma,
  userId: string,
  input: CyclePaymentPlanInput,
) {
  const dueDateStatus = input.dueDateStatus ?? (input.dueDate ? "ESTIMATED" : "UNSET");
  if (!validateDueDate(input.dueDate, dueDateStatus)) return {ok:false as const,error:"Due date and confidence do not agree"};
  if (input.expectedAmount < 0) {
    return { ok: false as const, error: "Expected amount cannot be negative" };
  }
  if (!Number.isSafeInteger(input.expectedAmount)) return {ok:false as const,error:"Expected amount must be whole centavos"};

  const period = await prisma.budgetPeriod.findFirst({ where: { id: input.budgetPeriodId, userId } });
  if (!period) return { ok: false as const, error: "Budget period not found" };
  if (input.fundingAccountId && !await prisma.account.findFirst({where:{id:input.fundingAccountId,userId}})) {
    return {ok:false as const,error:"Funding account not found"};
  }

  if (input.sourceType === "LOAN") {
    const loan = await prisma.loan.findFirst({
      where: { id: input.sourceId, userId, archivedAt: null },
    });
    if (!loan) return { ok: false as const, error: "Loan not found" };
  } else {
    const card = await prisma.creditCard.findFirst({ where: { id: input.sourceId, userId } });
    if (!card) return { ok: false as const, error: "Credit card not found" };
  }

  const plan = await prisma.cyclePaymentPlan.upsert({
    where: {
      budgetPeriodId_sourceType_sourceId: {
        budgetPeriodId: input.budgetPeriodId,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
      },
    },
    create: { userId, ...input, dueDateStatus },
    update: { expectedAmount: input.expectedAmount, dueDate: input.dueDate, dueDateStatus, ...(input.fundingAccountId !== undefined ? {fundingAccountId:input.fundingAccountId} : {}) },
  });

  return { ok: true as const, plan };
}

export async function linkPlanPayment(prisma: Pick<PrismaClient,"$transaction">, userId:string, planId:string, transactionId:string, amount:number) {
  if(!Number.isSafeInteger(amount)||amount<=0) return {ok:false as const,error:"Payment amount must be positive centavos"};
  return prisma.$transaction(async tx=>{
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;
    const plan=await tx.cyclePaymentPlan.findFirst({where:{id:planId,userId}});
    const transaction=await tx.transaction.findFirst({where:{id:transactionId,userId}});
    if(!plan||!transaction||transaction.amount>=0||amount>Math.abs(transaction.amount)) return {ok:false as const,error:"Invalid outgoing payment"};
    const matches=plan.sourceType==="LOAN" ? transaction.type==="LOAN_PAYMENT"&&transaction.loanId===plan.sourceId : transaction.type==="CREDIT_CARD_PAYMENT"&&transaction.creditCardId===plan.sourceId;
    if(!matches) return {ok:false as const,error:"Payment does not belong to this obligation"};
    const existing=await tx.planPayment.findUnique({where:{transactionId}});
    if(existing) return existing.planId===planId&&existing.amount===amount ? {ok:true as const} : {ok:false as const,error:"Payment already allocated"};
    await tx.planPayment.create({data:{userId,planId,transactionId,amount}});
    return {ok:true as const};
  });
}
