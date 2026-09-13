import type { PrismaClient } from "@prisma/client";

export async function updateThemeMode(
  prisma: Pick<PrismaClient, "user">,
  userId: string,
  themeMode: string,
): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { themeMode } });
}
