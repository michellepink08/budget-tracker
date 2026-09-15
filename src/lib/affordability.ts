export type AffordabilityResult = { canAfford: boolean; remainingAfter: number };

// Pure arithmetic — both amounts are minor units. No Prisma, no server
// round-trip: the Dashboard already knows safeToSpend the moment it
// renders, so this only ever runs client-side against a value it already has.
export function checkAffordability(amount: number, safeToSpend: number): AffordabilityResult {
  return { canAfford: amount <= safeToSpend, remainingAfter: safeToSpend - amount };
}
