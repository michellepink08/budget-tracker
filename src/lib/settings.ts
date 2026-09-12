import type { PrismaClient } from "@prisma/client";

export async function updateAccentColor(
  prisma: Pick<PrismaClient, "user">,
  userId: string,
  accentColor: string,
): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { accentColor } });
}

export async function updateThemeMode(
  prisma: Pick<PrismaClient, "user">,
  userId: string,
  themeMode: string,
): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { themeMode } });
}
