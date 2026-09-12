"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { accentColorSchema, themeModeSchema } from "@/lib/validations/settings";
import { updateAccentColor, updateThemeMode } from "@/lib/settings";

export type SettingsActionResult = { ok: true } | { ok: false; error: string };

export async function updateAccentColorAction(accentColor: string): Promise<SettingsActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const parsed = accentColorSchema.safeParse({ accentColor });
  if (!parsed.success) return { ok: false, error: "Unknown accent color" };

  await updateAccentColor(prisma, session.user.id, parsed.data.accentColor);

  // Revalidates the whole route tree, including the root layout, which is
  // where the accent is stamped onto <html> — a page-level revalidatePath
  // wouldn't reach it.
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function updateThemeModeAction(themeMode: string): Promise<SettingsActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const parsed = themeModeSchema.safeParse({ themeMode });
  if (!parsed.success) return { ok: false, error: "Unknown theme mode" };

  await updateThemeMode(prisma, session.user.id, parsed.data.themeMode);

  revalidatePath("/", "layout");
  return { ok: true };
}
