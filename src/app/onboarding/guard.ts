import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function requireNotOnboarded() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { onboardedAt: true },
  });
  if (user?.onboardedAt) {
    redirect("/dashboard");
  }
}
