import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { listAccounts } from "@/lib/accounts";
import { listCategories } from "@/lib/categories";
import { TopNav } from "@/components/nav/top-nav";

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

  return (
    <div className="min-h-screen bg-background">
      <TopNav accounts={accounts} categories={categories} />
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
