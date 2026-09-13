import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { listCategories } from "@/lib/categories";
import { listAccounts } from "@/lib/accounts";
import { DEMO_EMAIL } from "@/lib/config";
import { AppearanceSettings } from "@/components/settings/appearance-settings";
import { CategoriesSettings } from "@/components/settings/categories-settings";
import { RecurringSettings } from "@/components/settings/recurring-settings";
import { ExportSettings } from "@/components/settings/export-settings";
import { DemoDataSettings } from "@/components/settings/demo-data-settings";
import { ReceiptsSettings } from "@/components/settings/receipts-settings";

export default async function SettingsPage() {
  const session = await auth();
  const user = await prisma.user.findUniqueOrThrow({ where: { id: session!.user.id } });

  const [categories, accounts, dueRules, allRules] = await Promise.all([
    listCategories(prisma, user.id),
    listAccounts(prisma, user.id),
    prisma.recurringRule.findMany({
      where: { userId: user.id, active: true, nextDate: { lte: new Date() } },
      orderBy: { nextDate: "asc" },
      include: { account: true },
    }),
    prisma.recurringRule.findMany({
      where: { userId: user.id },
      orderBy: { nextDate: "asc" },
      include: { account: true, category: true },
    }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Settings</h1>

      <div>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">Appearance</h2>
        <AppearanceSettings initialThemeMode={user.themeMode} />
      </div>

      <div>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">Categories</h2>
        <CategoriesSettings categories={categories} />
      </div>

      <div>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">Recurring</h2>
        <RecurringSettings dueRules={dueRules} allRules={allRules} accounts={accounts} categories={categories} />
      </div>

      <div>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">Export</h2>
        <ExportSettings accounts={accounts} categories={categories} />
      </div>

      <div>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">Receipts</h2>
        <ReceiptsSettings initialAutoDeleteImages={user.receiptAutoDeleteImages} />
      </div>

      {user.email === DEMO_EMAIL && (
        <div>
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">Demo data</h2>
          <DemoDataSettings />
        </div>
      )}
    </div>
  );
}
