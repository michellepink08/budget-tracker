import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getLatestPrice } from "@/lib/shopping-catalog";
import { computeShoppingAllowance } from "@/lib/shopping-list";
import { CurrentListView } from "@/components/shopping/current-list-view";
import { SavedListsView } from "@/components/shopping/saved-lists-view";
import { CatalogView } from "@/components/shopping/catalog-view";
import { PurchaseHistoryView } from "@/components/shopping/purchase-history-view";
import { ListFormDialog } from "@/components/shopping/list-form-dialog";

const TABS = ["current", "saved", "catalog", "history", "scan"] as const;
type Tab = (typeof TABS)[number];

const TAB_LABELS: Record<Tab, string> = {
  current: "Current List",
  saved: "Saved Lists",
  catalog: "Items & Prices",
  history: "Purchase History",
  scan: "Scan Receipt",
};

export default async function ShoppingPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await auth();
  const user = await prisma.user.findUniqueOrThrow({ where: { id: session!.user.id } });

  const params = await searchParams;
  const tab: Tab = TABS.includes(params.tab as Tab) ? (params.tab as Tab) : "current";

  const categories = await prisma.category.findMany({
    where: { userId: user.id, archivedAt: null },
    orderBy: { name: "asc" },
  });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Shopping</h1>

      <div className="flex flex-wrap gap-2 border-b border-border pb-2">
        {TABS.map((t) => (
          <Link
            key={t}
            href={`/shopping?tab=${t}`}
            className={`rounded-md px-3 py-1.5 text-sm ${
              t === tab ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"
            }`}
          >
            {TAB_LABELS[t]}
          </Link>
        ))}
      </div>

      {tab === "current" && <CurrentListTab userId={user.id} currency={user.currency} categories={categories} />}
      {tab === "saved" && <SavedListsTab userId={user.id} categories={categories} />}
      {tab === "catalog" && <CatalogTab userId={user.id} currency={user.currency} categories={categories} />}
      {tab === "history" && <HistoryTab userId={user.id} currency={user.currency} />}
      {tab === "scan" && <p className="text-muted-foreground">Receipt scanning is coming in a future update.</p>}
    </div>
  );
}

async function CurrentListTab({
  userId,
  currency,
  categories,
}: {
  userId: string;
  currency: string;
  categories: { id: string; name: string }[];
}) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const list = await prisma.shoppingList.findFirst({ where: { userId, isCurrent: true } });

  const catalogItems = await prisma.shoppingCatalogItem.findMany({
    where: { userId, archivedAt: null },
    orderBy: { canonicalName: "asc" },
  });

  if (!list) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-muted-foreground">No current list yet. Create one to start shopping.</p>
        <div>
          <ListFormDialog categories={categories} />
        </div>
      </div>
    );
  }

  const items = await prisma.shoppingListItem.findMany({
    where: { listId: list.id },
    include: { catalogItem: { select: { canonicalName: true } } },
    orderBy: { sortOrder: "asc" },
  });

  const allowance = await computeShoppingAllowance(prisma, userId, list, user.cycleStartDay);

  return (
    <CurrentListView
      list={list}
      items={items}
      allowance={allowance}
      currency={currency}
      catalogItems={catalogItems.map((c) => ({ id: c.id, canonicalName: c.canonicalName }))}
    />
  );
}

async function SavedListsTab({ userId, categories }: { userId: string; categories: { id: string; name: string }[] }) {
  const lists = await prisma.shoppingList.findMany({
    where: { userId, isCurrent: false },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { items: true } } },
  });

  return (
    <SavedListsView
      lists={lists.map((l) => ({ id: l.id, name: l.name, plannedDate: l.plannedDate, itemCount: l._count.items }))}
      categories={categories}
    />
  );
}

async function CatalogTab({
  userId,
  currency,
  categories,
}: {
  userId: string;
  currency: string;
  categories: { id: string; name: string }[];
}) {
  const items = await prisma.shoppingCatalogItem.findMany({
    where: { userId, archivedAt: null },
    orderBy: { canonicalName: "asc" },
  });

  const withLatestPrice = await Promise.all(
    items.map(async (item) => ({
      ...item,
      latestPrice: (await getLatestPrice(prisma, userId, item.id))?.unitPrice ?? null,
    })),
  );

  return <CatalogView items={withLatestPrice} categories={categories} currency={currency} />;
}

async function HistoryTab({ userId, currency }: { userId: string; currency: string }) {
  const items = await prisma.shoppingListItem.findMany({
    where: { userId, isPurchased: true },
    include: { catalogItem: { select: { canonicalName: true } }, list: { select: { name: true } } },
    orderBy: { id: "desc" },
    take: 100,
  });

  return <PurchaseHistoryView items={items} currency={currency} />;
}
