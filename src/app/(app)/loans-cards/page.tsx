import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { listAccounts } from "@/lib/accounts";
import { listCategories } from "@/lib/categories";
import { computeLoanRemainingBalance, listLoans } from "@/lib/loans";
import { listCreditCards } from "@/lib/credit-cards";
import { computeAccountBalance } from "@/lib/account-balance";
import {linkedPlanActual,cardStatementSummary} from "@/lib/financial-obligations";
import {nextStatementDate,projectCardStatement} from "@/lib/card-statements";
import {
  listDueInstallmentPayments,
  listInstallmentPurchases,
} from "@/lib/installment-purchases";
import { LoanFormDialog } from "@/components/loans-cards/loan-form-dialog";
import { LoanList } from "@/components/loans-cards/loan-list";
import { CreditCardFormDialog } from "@/components/loans-cards/credit-card-form-dialog";
import { CreditCardList } from "@/components/loans-cards/credit-card-list";
import { InstallmentPurchaseFormDialog } from "@/components/loans-cards/installment-purchase-form-dialog";
import { DueInstallmentPaymentsBanner } from "@/components/loans-cards/due-installment-payments-banner";
import { InstallmentPurchaseList } from "@/components/loans-cards/installment-purchase-list";

const DEBT_ACCOUNT_TYPES = ["CREDIT_CARD", "LOAN"];

export default async function LoansCardsPage() {
  const session = await auth();
  const userId = session!.user.id;
  const now = new Date();

  const [accounts, categories, rawLoans, creditCards, installmentPurchases, dueInstallmentPayments] =
    await Promise.all([
      listAccounts(prisma, userId),
      listCategories(prisma, userId),
      listLoans(prisma, userId),
      listCreditCards(prisma, userId),
      listInstallmentPurchases(prisma, userId),
      listDueInstallmentPayments(prisma, userId, now),
    ]);

  const loans = await Promise.all(
    rawLoans.map(async (loan) => ({
      ...loan,
      remainingBalance: await computeLoanRemainingBalance(prisma, loan),
      loanCategoryName: loan.subcategory?.name ?? null,
    })),
  );

  const payingAccounts = accounts.filter((a) => !DEBT_ACCOUNT_TYPES.includes(a.accountType));

  const linkedAccountIds = new Set(creditCards.map((c) => c.accountId));
  const linkableAccounts = accounts.filter(
    (a) => a.accountType === "CREDIT_CARD" && !linkedAccountIds.has(a.id),
  );
  const creditCardAccounts = accounts.filter((a) => a.accountType === "CREDIT_CARD");
  const cardPlans=await prisma.cyclePaymentPlan.findMany({where:{userId,sourceType:"CREDIT_CARD"},include:{budgetPeriod:true,payments:{include:{transaction:true}}},orderBy:{budgetPeriod:{startDate:"desc"}}});

  const cardsWithAccount = await Promise.all(
    creditCards.map(async (card) => {
      const account = accounts.find((a) => a.id === card.accountId)!;
      const available=await computeAccountBalance(prisma,account.id),plan=cardPlans.find(p=>p.sourceId===card.id);
      let actual=plan?linkedPlanActual(plan):0;
      const statementIsExpected=Boolean(plan?.statementDate&&(plan.statementDate>now||plan.dueDateStatus!=="CONFIRMED"));
      const ledger=await prisma.transaction.findMany({where:{userId,accountId:card.accountId}});
      const nextStatement=projectCardStatement({...card,account},nextStatementDate(now,card.statementDay),ledger,cardPlans,now);
      const plannedForecast=plan?.statementDate&&statementIsExpected?projectCardStatement({...card,account},plan.statementDate,ledger,cardPlans,now):null;
      const automaticPlan=Boolean(plannedForecast&&plan?.expectedAmount===plan?.statementAmount);
      if(automaticPlan)actual=plannedForecast!.actual;
      return {
        ...card,
        nextStatement,
        totalLiability:card.creditLimit-available,
        statementIsExpected,
        statementSummary:cardStatementSummary(card.creditLimit-available,plannedForecast?.principal??plan?.statementAmount??null,actual,statementIsExpected?null:plan?.verifiedUnbilledAmount??null),
        plannedPayment:automaticPlan?plannedForecast!.expected:plan?.expectedAmount??null,paidAmount:actual,
        plannedDueDate:plan?.dueDate??null,dueDateStatus:plan?.dueDateStatus??"UNSET",
        account: {
          name: account.name,
          currency: account.currency,
          balance: available,
        },
      };
    }),
  );

  const purchasesWithAccount = installmentPurchases.map((purchase) => {
    const account = accounts.find((a) => a.id === purchase.accountId)!;
    return { ...purchase, account: { currency: account.currency } };
  });

  const dueInstallmentPaymentsView = dueInstallmentPayments.flatMap((payment) => {
    const purchase = installmentPurchases.find((p) => p.id === payment.installmentPurchaseId);
    if (!purchase) return [];
    return [
      {
        id: payment.id,
        termNumber: payment.termNumber,
        amount: payment.amount,
        dueDate: payment.dueDate,
        purchaseName: purchase.name,
        numberOfTerms: purchase.numberOfTerms,
      },
    ];
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-semibold">Loans & Cards</h1>
        <div className="flex flex-wrap gap-2">
          <LoanFormDialog />
          <CreditCardFormDialog linkableAccounts={linkableAccounts} />
          <InstallmentPurchaseFormDialog creditCardAccounts={creditCardAccounts} categories={categories} />
        </div>
      </div>

      {creditCardAccounts.length === 0 && (
        <p className="rounded-lg border bg-card p-3 text-sm text-muted-foreground">
          To add a credit card or an installment purchase (like Shopee SPayLater), first create an account with type
          &quot;Credit Card&quot; in{" "}
          <Link href="/accounts" className="text-primary underline">
            Manage accounts
          </Link>
          .
        </p>
      )}

      <DueInstallmentPaymentsBanner payments={dueInstallmentPaymentsView} payingAccounts={payingAccounts} />

      <div>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">Loans</h2>
        <LoanList loans={loans} payingAccounts={payingAccounts} />
      </div>

      <div>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">Credit cards</h2>
        <CreditCardList
          cards={cardsWithAccount}
          linkableAccounts={linkableAccounts}
          payingAccounts={payingAccounts}
        />
      </div>

      <div>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">Installment purchases</h2>
        <InstallmentPurchaseList purchases={purchasesWithAccount} payingAccounts={payingAccounts} />
      </div>
    </div>
  );
}
