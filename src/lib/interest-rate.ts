// Loans (and credit cards) always store interestRate as an annual
// percentage — this just lets the form accept either unit from the user
// and convert it before the value ever reaches the schema/DB.
export const INTEREST_RATE_PERIODS = ["ANNUAL", "MONTHLY"] as const;
export type InterestRatePeriod = (typeof INTEREST_RATE_PERIODS)[number];

export function toAnnualInterestRate(rate: number, period: InterestRatePeriod): number {
  return period === "MONTHLY" ? rate * 12 : rate;
}

// Inverse of the above — used to prefill the form when editing an existing
// loan under the "Monthly" period, so the displayed number round-trips.
export function fromAnnualInterestRate(annualRate: number, period: InterestRatePeriod): number {
  return period === "MONTHLY" ? annualRate / 12 : annualRate;
}
