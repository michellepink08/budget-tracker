import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { listAccounts } from "@/lib/accounts";
import { listCategories } from "@/lib/categories";
import { listLoans } from "@/lib/loans";
import { listCreditCards } from "@/lib/credit-cards";
import { computeAccountBalance } from "@/lib/account-balance";
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

  const [accounts, categories, loans, creditCards, installmentPurchases, dueInstallmentPayments] =
    await Promise.all([
      listAccounts(prisma, userId),
      listCategories(prisma, userId),
      listLoans(prisma, userId),
      listCreditCards(prisma, userId),
      listInstallmentPurchases(prisma, userId),
      listDueInstallmentPayments(prisma, userId, now),
    ]);

  const payingAccounts = accounts.filter((a) => !DEBT_ACCOUNT_TYPES.includes(a.accountType));

  const linkedAccountIds = new Set(creditCards.map((c) => c.accountId));
  const linkableAccounts = accounts.filter(
    (a) => a.accountType === "CREDIT_CARD" && !linkedAccountIds.has(a.id),
  );
  const creditCardAccounts = accounts.filter((a) => a.accountType === "CREDIT_CARD");

  const cardsWithAccount = await Promise.all(
    creditCards.map(async (card) => {
      const account = accounts.find((a) => a.id === card.accountId)!;
      return {
        ...card,
        account: {
          name: account.name,
          currency: account.currency,
          balance: await computeAccountBalance(prisma, account.id),
        },
      };
    }),
  );

  const purchasesWithAccount = installmentPurchases.map((purchase) => {
    const account = accounts.find((a) => a.id === purchase.accountId)!;
    return { ...purchase, account: { currency: account.currency } };
  });

  const dueInstallmentPaymentsView = dueInstallmentPayments.map((payment) => {
    const purchase = installmentPurchases.find((p) => p.id === payment.installmentPurchaseId)!;
    return {
      id: payment.id,
      termNumber: payment.termNumber,
      amount: payment.amount,
      dueDate: payment.dueDate,
      purchaseName: purchase.name,
      numberOfTerms: purchase.numberOfTerms,
    };
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Loans & Cards</h1>
        <div className="flex gap-2">
          <LoanFormDialog />
          <CreditCardFormDialog linkableAccounts={linkableAccounts} />
          <InstallmentPurchaseFormDialog creditCardAccounts={creditCardAccounts} categories={categories} />
        </div>
      </div>

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
        <InstallmentPurchaseList purchases={purchasesWithAccount} />
      </div>
    </div>
  );
}
