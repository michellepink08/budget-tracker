import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { listAccounts } from "@/lib/accounts";
import { computeLendingOutstanding, listLendings } from "@/lib/lending";
import { LendingFormDialog } from "@/components/lending/lending-form-dialog";
import { LendingList } from "@/components/lending/lending-list";

export default async function LendingPage() {
  const session = await auth();
  const userId = session!.user.id;

  const [accounts, rawLendings] = await Promise.all([listAccounts(prisma, userId), listLendings(prisma, userId)]);

  const lendings = await Promise.all(
    rawLendings.map(async (lending) => ({
      ...lending,
      outstanding: await computeLendingOutstanding(prisma, lending),
    })),
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-semibold">Lending</h1>
        <LendingFormDialog accounts={accounts} />
      </div>

      <LendingList lendings={lendings} accounts={accounts} />
    </div>
  );
}
