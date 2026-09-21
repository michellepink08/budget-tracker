// Classifies transaction types into signed effects. See the design spec's
// "Account-balance rules": every transaction row is a self-contained
// signed ledger entry against its own accountId — a transfer's two rows
// (src/lib/transfers.ts) are just two such entries with opposite signs.

export type SignableTransactionType =
  | "EXPENSE"
  | "INCOME"
  | "RECEIVABLE_REPAYMENT"
  | "REFUND"
  | "SAVINGS"
  | "LOAN_PAYMENT"
  | "CREDIT_CARD_PAYMENT"
  | "TRANSFER_FEE"
  | "LENDING";

const INFLOW_TYPES = new Set<SignableTransactionType>(["INCOME", "REFUND", "RECEIVABLE_REPAYMENT"]);
const OUTFLOW_TYPES = new Set<SignableTransactionType>([
  "EXPENSE",
  "SAVINGS",
  "LOAN_PAYMENT",
  "CREDIT_CARD_PAYMENT",
  "TRANSFER_FEE",
  "LENDING",
]);

/**
 * Given a transaction type (everything except TRANSFER and
 * BALANCE_ADJUSTMENT, which get their sign from elsewhere — see
 * src/lib/transfers.ts for TRANSFER; BALANCE_ADJUSTMENT is Plan 3A
 * reconciliation work and isn't built yet) and a non-negative magnitude,
 * returns the signed amount to store on the transaction row.
 */
export function signedAmountForType(type: SignableTransactionType, magnitude: number): number {
  if (magnitude < 0) {
    throw new Error(`magnitude must be non-negative, got ${magnitude}`);
  }
  if (INFLOW_TYPES.has(type)) return magnitude;
  if (OUTFLOW_TYPES.has(type)) return -magnitude;
  throw new Error(`Unhandled transaction type: ${type}`);
}

/**
 * The effect a transaction row has on the balance of the given account.
 * Every row's `amount` already carries the correct sign for its own
 * `accountId` (see signedAmountForType and src/lib/transfers.ts) — this
 * just filters out rows that don't belong to the account being computed.
 */
export function accountEffect(
  transaction: { accountId: string; amount: number },
  accountId: string,
): number {
  return transaction.accountId === accountId ? transaction.amount : 0;
}
