"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { themeModeSchema } from "@/lib/validations/settings";
import { updateReceiptAutoDeleteImages, updateThemeMode } from "@/lib/settings";

export type SettingsActionResult = { ok: true } | { ok: false; error: string };

export async function updateThemeModeAction(themeMode: string): Promise<SettingsActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const parsed = themeModeSchema.safeParse({ themeMode });
  if (!parsed.success) return { ok: false, error: "Unknown theme mode" };

  await updateThemeMode(prisma, session.user.id, parsed.data.themeMode);

  revalidatePath("/", "layout");
  return { ok: true };
}

export async function updateReceiptAutoDeleteImagesAction(enabled: boolean): Promise<SettingsActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  await updateReceiptAutoDeleteImages(prisma, session.user.id, enabled);

  revalidatePath("/settings");
  return { ok: true };
}
