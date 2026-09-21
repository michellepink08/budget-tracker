import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { listAccounts } from "@/lib/accounts";
import { listCategories } from "@/lib/categories";
import { TopNav } from "@/components/nav/top-nav";
import { SideNav } from "@/components/nav/side-nav";
import { DemoBanner } from "@/components/nav/demo-banner";
import { DEMO_EMAIL } from "@/lib/config";
import { WorkspaceSections } from "@/components/nav/workspace-sections";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (session?.user) {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { onboardedAt: true },
    });
    if (!user?.onboardedAt) {
      redirect("/onboarding");
    }
  }

  const [accounts, categories] = session?.user
    ? await Promise.all([
        listAccounts(prisma, session.user.id),
        listCategories(prisma, session.user.id),
      ])
    : [[], []];

  const isDemo = session?.user?.email === DEMO_EMAIL;

  return (
    <div className="flex min-h-screen bg-background">
      <SideNav accounts={accounts} categories={categories} />
      <div className="flex min-w-0 flex-1 flex-col">
        {isDemo && <DemoBanner />}
        <TopNav accounts={accounts} categories={categories} email={session?.user?.email ?? null} />
        <main className="workspace-main w-full min-w-0 flex-1 px-4 py-6 md:px-7"><WorkspaceSections />{children}</main>
      </div>
    </div>
  );
}
