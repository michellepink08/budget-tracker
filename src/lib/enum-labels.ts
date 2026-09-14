/**
 * Turns a SCREAMING_SNAKE_CASE enum value (as stored by Prisma) into a
 * human-friendly label for display, e.g. "LOAN_PAYMENT" -> "Loan Payment".
 */
export function humanizeEnum(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((word) => (word.length > 0 ? word[0].toUpperCase() + word.slice(1) : word))
    .join(" ");
}
