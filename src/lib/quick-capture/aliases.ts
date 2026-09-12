import type { PrismaClient } from "@prisma/client";

export type AliasKind = "account" | "category";

export type AliasInput = { kind: AliasKind; alias: string; targetId: string };

function normalize(text: string): string {
  return text.trim().toLowerCase();
}

// Aliases are data-driven, per-user rows — never hardcoded conditionals
// in the parser or UI. This is the one place alias rows are written;
// there's no configuration UI yet (a later phase), but this function is
// what such a UI would call.
export async function createAlias(
  prisma: Pick<PrismaClient, "alias">,
  userId: string,
  input: AliasInput,
) {
  const alias = normalize(input.alias);
  return prisma.alias.upsert({
    where: { userId_kind_alias: { userId, kind: input.kind, alias } },
    update: { targetId: input.targetId },
    create: { userId, kind: input.kind, alias, targetId: input.targetId },
  });
}

export type ResolveCandidate = { id: string; name: string };

export type ResolveResult =
  | { status: "resolved"; id: string }
  | { status: "ambiguous"; candidateIds: string[] }
  | { status: "unresolved" };

// Resolves a raw piece of text (e.g. "bpi", "transpo") against the
// user's own stored aliases first, then falls back to matching the real
// account/category names directly — so aliases are an optional
// shortcut, never the only way to refer to something that already has a
// perfectly good name.
export async function resolveAlias(
  prisma: Pick<PrismaClient, "alias">,
  userId: string,
  kind: AliasKind,
  raw: string,
  candidates: ResolveCandidate[],
): Promise<ResolveResult> {
  const normalized = normalize(raw);

  const aliasRow = await prisma.alias.findUnique({
    where: { userId_kind_alias: { userId, kind, alias: normalized } },
  });
  if (aliasRow) {
    return { status: "resolved", id: (aliasRow as { targetId: string }).targetId };
  }

  const exact = candidates.filter((c) => normalize(c.name) === normalized);
  if (exact.length === 1) return { status: "resolved", id: exact[0].id };

  const partial = candidates.filter(
    (c) => normalize(c.name).includes(normalized) || normalized.includes(normalize(c.name)),
  );
  if (partial.length === 1) return { status: "resolved", id: partial[0].id };
  if (partial.length > 1) return { status: "ambiguous", candidateIds: partial.map((c) => c.id) };

  return { status: "unresolved" };
}
