// All amounts elsewhere in the app are stored as integers in minor units
// (centavos for PHP, cents for USD). This is the one place that converts
// between minor units and a human-readable major-unit display value.

const MINOR_UNITS_PER_MAJOR: Record<string, number> = { PHP: 100, USD: 100 };
const CURRENCY_SYMBOLS: Record<string, string> = { PHP: "₱", USD: "$" };

function factorFor(currency: string): number {
  return MINOR_UNITS_PER_MAJOR[currency] ?? 100;
}

export function toMinorUnits(majorUnits: number, currency: string): number {
  return Math.round(majorUnits * factorFor(currency));
}

export function toMajorUnits(minorUnits: number, currency: string): number {
  return minorUnits / factorFor(currency);
}

export function formatMoney(minorUnits: number, currency: string): string {
  const symbol = CURRENCY_SYMBOLS[currency] ?? `${currency} `;
  const major = toMajorUnits(minorUnits, currency);
  const sign = major < 0 ? "-" : "";
  const abs = Math.abs(major).toFixed(2);
  return `${sign}${symbol}${abs}`;
}
