import { z } from "zod";

// The actual balance a user enters can legitimately be zero or negative
// (an overdrawn credit card, an emptied e-wallet) — only non-numeric input
// is rejected.
export const reconciliationSchema = z.object({
  actualBalance: z.number(), // major units
});
