import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { listAccounts } from "@/lib/accounts";
import { computeLendingOutstanding, listLendings } from "@/lib/lending";
import { LendingFormDialog } from "@/components/lending/lending-form-dialog";
import { LendingList } from "@/components/lending/lending-list";

export default async function LendingPage() {
  const session = await auth();
  const userId = session!.user.id;

  const [accounts, rawLendings,repayments] = await Promise.all([listAccounts(prisma, userId), listLendings(prisma, userId),prisma.transaction.findMany({where:{userId,type:"RECEIVABLE_REPAYMENT",amount:{gt:0}},include:{account:true},orderBy:{date:"desc"}})]);

  const lendings = await Promise.all(
    rawLendings.map(async (lending) => ({
      ...lending,
      outstanding: await computeLendingOutstanding(prisma, lending),
      history:repayments.filter(t=>lending.subcategoryId&&t.subcategoryId===lending.subcategoryId).map(t=>({id:t.id,date:t.date,amount:t.amount,accountName:t.account.name,currency:t.account.currency,description:t.description})),
    })),
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div><h1 className="text-xl font-semibold">Lending &amp; Repayments</h1><p className="mt-1 text-sm text-muted-foreground">Money lent, remaining balances and repayments · All dates</p></div>
        <LendingFormDialog accounts={accounts} />
      </div>

      <LendingList lendings={lendings} accounts={accounts} />
    </div>
  );
}
