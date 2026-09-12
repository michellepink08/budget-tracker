// First-match heuristic: returns the first number-shaped token in the
// text, treating "," as a thousands separator. This is a known
// limitation of a first deterministic pass — a clause containing a
// digit-form date before its amount (e.g. "9/1 paid 180...") would
// misparse. None of this app's supported command phrasings hit that
// case (dates are always written as words: "yesterday", "last Saturday",
// "August 27"), so it isn't handled here.
const AMOUNT_PATTERN = /\d+(?:,\d{3})*(?:\.\d+)?/;

export function parseAmountMajorUnits(text: string): number | null {
  const match = text.match(AMOUNT_PATTERN);
  if (!match) return null;
  const value = Number(match[0].replace(/,/g, ""));
  return Number.isFinite(value) ? value : null;
}
