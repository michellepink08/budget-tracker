"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { DEMO_EMAIL } from "@/lib/config";
import { seedDemoData } from "@/lib/demo-seed";

export type DemoActionResult = { ok: true } | { ok: false; error: string };

export async function resetDemoDataAction(): Promise<DemoActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.user.id } });
  if (user.email !== DEMO_EMAIL) {
    return { ok: false, error: "Only the demo account can be reset" };
  }

  await seedDemoData(prisma, user.id, user.cycleStartDay);
  await prisma.user.update({ where: { id: user.id }, data: { demoResetAt: new Date() } });

  revalidatePath("/", "layout");
  return { ok: true };
}
