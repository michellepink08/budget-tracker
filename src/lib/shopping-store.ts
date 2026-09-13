import type { PrismaClient } from "@prisma/client";

// Stores are cheap, freeform, and per-user — rather than a dedicated
// management page, any form that accepts a store name resolves it through
// this helper: match an existing store case-insensitively, or create one.
export async function getOrCreateStore(
  prisma: Pick<PrismaClient, "shoppingStore">,
  userId: string,
  name: string | null,
): Promise<string | null> {
  const trimmed = name?.trim();
  if (!trimmed) return null;

  const existing = await prisma.shoppingStore.findFirst({
    where: { userId, name: { equals: trimmed, mode: "insensitive" } },
  });
  if (existing) return existing.id;

  const created = await prisma.shoppingStore.create({ data: { userId, name: trimmed } });
  return created.id;
}
