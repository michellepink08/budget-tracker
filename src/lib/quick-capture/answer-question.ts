import type { PrismaClient } from "@prisma/client";
import { computeLiquidFunds } from "@/lib/liquid-funds";
import { computeConfirmedReserves, computeDisposableTotal } from "@/lib/purpose-totals";
import { listRestrictedFundGroups } from "@/lib/restricted-funds";
import { listAllocationsWithActuals } from "@/lib/budget-allocations";
import { computeSafeToSpend } from "@/lib/safe-to-spend";
import { computeAccountBalance } from "@/lib/account-balance";
import { resolveBudgetPeriodForDate } from "@/lib/budget-period";
import { getCycleForDate } from "@/lib/cycle";
import { computeCategoryActual } from "@/lib/category-actual";
import { spendingByCategory } from "@/lib/reports";
import { listPayables, listDuePayables } from "@/lib/payables";
import { getRecommendedFundingTransfer } from "@/lib/transfer-recommendations";
import { getShoppingDashboardSummary } from "@/lib/shopping-summary";
import type { QuestionDraft } from "@/lib/quick-capture/types";

export type QuestionAnswer =
  | { kind: "amount"; label: string; amountMinorUnits: number }
  | { kind: "list"; label: string; items: { label: string; amountMinorUnits: number }[] }
  | { kind: "text"; label: string; text: string }
  | { kind: "unavailable"; message: string };

type AnswerPrisma = Pick<
  PrismaClient,
  | "account"
  | "transaction"
  | "budgetPeriod"
  | "budgetAllocation"
  | "category"
  | "payable"
  | "creditCard"
  | "savingsGoal"
  | "shoppingList"
  | "shoppingListItem"
  | "yearPlan"
  | "yearPlanPhase"
  | "incomeForecast"
>;

async function totalExpenseForPeriod(
  prisma: Pick<PrismaClient, "transaction">,
  budgetPeriodId: string | null,
): Promise<number> {
  if (!budgetPeriodId) return 0;
  const transactions = await prisma.transaction.findMany({
    where: { budgetPeriodId, type: "EXPENSE" },
  });
  return transactions.reduce((sum: number, t: { amount: number }) => sum + Math.abs(t.amount), 0);
}

export async function answerQuestion(
  prisma: AnswerPrisma,
  userId: string,
  cycleStartDay: number,
  draft: QuestionDraft,
): Promise<QuestionAnswer> {
  const now = new Date();

  switch (draft.questionType) {
    case "liquid_funds":
      return { kind: "amount", label: "Liquid funds", amountMinorUnits: await computeLiquidFunds(prisma, userId) };

    case "account_balance": {
      if (draft.account?.id) {
        const balance = await computeAccountBalance(prisma, draft.account.id);
        return { kind: "amount", label: draft.account.raw, amountMinorUnits: balance };
      }
      return {
        kind: "amount",
        label: "Total money you have",
        amountMinorUnits: await computeLiquidFunds(prisma, userId),
      };
    }

    case "spending_current_cutoff": {
      const period = await resolveBudgetPeriodForDate(prisma, userId, now, cycleStartDay);
      return {
        kind: "amount",
        label: "Spent this cutoff",
        amountMinorUnits: await totalExpenseForPeriod(prisma, period.id),
      };
    }

    case "spending_previous_cutoff": {
      const currentCycle = getCycleForDate(cycleStartDay, now);
      const dayBefore = new Date(
        currentCycle.start.getFullYear(),
        currentCycle.start.getMonth(),
        currentCycle.start.getDate() - 1,
      );
      const previousCycle = getCycleForDate(cycleStartDay, dayBefore);
      const previousPeriod = await prisma.budgetPeriod.findUnique({
        where: { userId_startDate: { userId, startDate: previousCycle.start } },
      });
      return {
        kind: "amount",
        label: "Spent last cutoff",
        amountMinorUnits: await totalExpenseForPeriod(prisma, previousPeriod?.id ?? null),
      };
    }

    case "spending_by_category": {
      if (draft.category?.id) {
        const period = await resolveBudgetPeriodForDate(prisma, userId, now, cycleStartDay);
        const amount = await computeCategoryActual(prisma, period.id, draft.category.id);
        return { kind: "amount", label: draft.category.raw, amountMinorUnits: amount };
      }
      const period = await resolveBudgetPeriodForDate(prisma, userId, now, cycleStartDay);
      const spending = await spendingByCategory(prisma, userId, period.id);
      return {
        kind: "list",
        label: "Spending by category this cutoff",
        items: spending.map((s) => ({ label: s.categoryName, amountMinorUnits: s.amount })),
      };
    }

    case "upcoming_payables": {
      const payables = await listPayables(prisma, userId);
      return {
        kind: "list",
        label: "Upcoming payables",
        items: payables.map((p: { name: string; amount: number; dueDate: Date }) => ({
          label: `${p.name} — due ${p.dueDate.toLocaleDateString()}`,
          amountMinorUnits: p.amount,
        })),
      };
    }

    case "due_this_week": {
      const horizon = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7);
      const payables = await listDuePayables(prisma, userId, horizon);
      return {
        kind: "list",
        label: "Due this week",
        items: payables.map((p: { name: string; amount: number; dueDate: Date }) => ({
          label: `${p.name} — due ${p.dueDate.toLocaleDateString()}`,
          amountMinorUnits: p.amount,
        })),
      };
    }

    case "next_due": {
      const payables = await listPayables(prisma, userId);
      if (payables.length === 0) return { kind: "text", label: "Next due", text: "Nothing due" };
      const next = payables[0] as { name: string; dueDate: Date };
      return { kind: "text", label: "Next due", text: `${next.name} — due ${next.dueDate.toLocaleDateString()}` };
    }

    case "transfers_required": {
      const recommendation = await getRecommendedFundingTransfer(prisma, userId, now);
      if (!recommendation) {
        return { kind: "text", label: "Transfers required", text: "No transfer needed right now" };
      }
      return {
        kind: "amount",
        label: "Recommended transfer",
        amountMinorUnits: recommendation.amount,
      };
    }

    case "credit_card_balance":
    case "credit_card_due": {
      const card = draft.account?.id
        ? await prisma.creditCard.findFirst({ where: { accountId: draft.account.id, userId } })
        : await (async () => {
            const cards = await prisma.creditCard.findMany({ where: { userId } });
            return cards.length === 1 ? cards[0] : null;
          })();

      if (!card) {
        return { kind: "unavailable", message: "Which credit card did you mean?" };
      }

      if (draft.questionType === "credit_card_balance") {
        const balance = await computeAccountBalance(prisma, card.accountId);
        return { kind: "amount", label: "Credit card balance", amountMinorUnits: balance };
      }
      return {
        kind: "text",
        label: "Credit card due date",
        text: `Due on the ${card.paymentDueDay}${card.paymentDueDay === 1 ? "st" : "th"} of each month`,
      };
    }

    case "safe_to_spend": {
      const [disposableTotal, period, restrictedGroups, confirmedReserves, recommendation] = await Promise.all([
        computeDisposableTotal(prisma, userId),
        resolveBudgetPeriodForDate(prisma, userId, now, cycleStartDay),
        listRestrictedFundGroups(prisma, userId),
        computeConfirmedReserves(prisma, userId),
        getRecommendedFundingTransfer(prisma, userId, now),
      ]);
      const allocations = await listAllocationsWithActuals(prisma, userId, period.id);
      const totalRemaining = allocations.reduce((sum, a) => sum + (a.effectivePlanned - a.actual), 0);
      const payables = await listDuePayables(prisma, userId, period.endDate);
      const restrictedAccountIds = new Set(restrictedGroups.map((g) => g.accountId));
      const safeToSpend = computeSafeToSpend({
        disposableTotal,
        totalRemaining,
        payables: payables as { accountId: string; amount: number; dueDate: Date }[],
        restrictedAccountIds,
        cutoffEnd: period.endDate,
        requiredTransfers: recommendation?.amount ?? 0,
        confirmedReserves,
      });
      return { kind: "amount", label: "Safe to spend", amountMinorUnits: safeToSpend };
    }

    case "restricted_fund_balance": {
      if (draft.account?.id) {
        const balance = await computeAccountBalance(prisma, draft.account.id);
        return { kind: "amount", label: draft.account.raw, amountMinorUnits: balance };
      }
      const groups = await listRestrictedFundGroups(prisma, userId);
      const total = groups.reduce((sum, g) => sum + g.balance, 0);
      return { kind: "amount", label: "Restricted funds total", amountMinorUnits: total };
    }

    case "restricted_fund_coverage": {
      const groups = await listRestrictedFundGroups(prisma, userId);
      const named = draft.account?.id ? groups.find((g) => g.accountId === draft.account?.id) : undefined;
      const fund = named ?? (groups.length === 1 ? groups[0] : undefined);

      if (!fund) {
        if (groups.length === 0) {
          return { kind: "unavailable", message: "You don't have any restricted funds set up." };
        }
        return { kind: "unavailable", message: "Which fund did you mean?" };
      }

      const balanceMajor = (fund.balance / 100).toFixed(2);
      const obligationMajor = (fund.obligationTotal / 100).toFixed(2);
      const text =
        fund.projectedBalance >= 0
          ? `Yes — ${balanceMajor} covers ${obligationMajor} in upcoming obligations (${(fund.projectedBalance / 100).toFixed(2)} left over).`
          : `No — ${balanceMajor} is short of the ${obligationMajor} upcoming obligations by ${(Math.abs(fund.projectedBalance) / 100).toFixed(2)}.`;

      return { kind: "text", label: "Restricted fund coverage", text };
    }

    case "expected_income":
      return { kind: "unavailable", message: "Expected income isn't available yet" };

    case "shopping_selected_total": {
      const summary = await getShoppingDashboardSummary(prisma, userId, cycleStartDay, now);
      if (!summary) return { kind: "unavailable", message: "No current shopping list yet" };
      return { kind: "amount", label: "Selected shopping list total", amountMinorUnits: summary.estimatedTotal };
    }
  }
}
