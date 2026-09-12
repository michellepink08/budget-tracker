import type { RolloverMode } from "@/lib/constants/financial";

/**
 * Given a period's effective planned amount (plannedAmount + whatever
 * rolled into it) and its actual net spend, returns the amount that
 * carries into the *next* period's rolloverAmount for the same category,
 * per the allocation's own rolloverMode. See the design spec /
 * Plan 3A.1's header for the precise semantics of each mode.
 */
export function computeRolloverAmount(
  rolloverMode: RolloverMode,
  effectivePlanned: number,
  actual: number,
): number {
  const unused = effectivePlanned - actual;

  switch (rolloverMode) {
    case "NONE":
      return 0;
    case "CARRY_UNUSED":
      return Math.max(unused, 0);
    case "CARRY_OVERSPEND":
      return Math.min(unused, 0);
    case "CARRY_BOTH":
      return unused;
    default:
      throw new Error(`Unknown rollover mode: ${rolloverMode}`);
  }
}
