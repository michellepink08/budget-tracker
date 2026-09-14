"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { themeModeSchema } from "@/lib/validations/settings";
import { updateReceiptAutoDeleteImages, updateThemeMode } from "@/lib/settings";
import { assertNotDemo } from "@/lib/demo-guard";

export type SettingsActionResult = { ok: true } | { ok: false; error: string };

export async function updateThemeModeAction(themeMode: string): Promise<SettingsActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const parsed = themeModeSchema.safeParse({ themeMode });
  if (!parsed.success) return { ok: false, error: "Unknown theme mode" };

  const demoResult = await assertNotDemo(prisma, session.user.id);
  if (demoResult) return demoResult;

  await updateThemeMode(prisma, session.user.id, parsed.data.themeMode);

  revalidatePath("/", "layout");
  return { ok: true };
}

export async function updateReceiptAutoDeleteImagesAction(enabled: boolean): Promise<SettingsActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const demoResult = await assertNotDemo(prisma, session.user.id);
  if (demoResult) return demoResult;

  await updateReceiptAutoDeleteImages(prisma, session.user.id, enabled);

  revalidatePath("/settings");
  return { ok: true };
}
