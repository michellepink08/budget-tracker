import { createHash } from "node:crypto";
import { planSloanSplit } from "./sloan-split-core.mjs";

const authorized = [
  { name: "SPaylater", previous: 4919554, opening: 7056914, paid: 2137360, ending: 4919554,
    provenance: "September 10 opening balance corrected to PHP 70,569.14 by explicit user authorization." },
  { name: "SLoan", previous: 8089956, opening: 9254909, paid: 1164953, ending: 8089956,
    provenance: "September 10 opening balance derived from verified ending PHP 80,899.56 plus September 12 payment PHP 11,649.53 = PHP 92,549.09. Unverified PHP 94,733.33 was not used." },
];

const normalize = (value) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
const day = (value) => new Date(value).toISOString().slice(0, 10);

export function planSeptemberLoanImport(state) {
  if (!state.userId || !state.period || !state.account) throw Error("Missing user, cycle or MariBank account");
  if (day(state.period.startDate) !== "2026-09-11" || day(state.period.endDate) !== "2026-10-10") throw Error("Incorrect cycle");
  const result = { missing: [], alreadyRecorded: [], probableDuplicates: [] };
  for (const entry of authorized) {
    if (entry.name === "SLoan" && state.loans.some((l) => l.name === "SLoan 1")) {
      const split = planSloanSplit({ ...state, accounts: [state.account] });
      if (!split.alreadyCorrected) throw Error("Incomplete SLoan correction");
      result.alreadyRecorded.push({ name: "SLoan 1 + SLoan 2 (corrected split)", recordId: split.paymentIds[0],
        recordIds: split.paymentIds, endingBalance: 9473339 });
      continue;
    }
    const loans = state.loans.filter((l) => l.userId === state.userId && normalize(l.name) === normalize(entry.name));
    if (loans.length !== 1) throw Error(`Ambiguous loan: ${entry.name}`);
    const loan = loans[0];
    const subs = state.subcategories.filter((s) => s.userId === state.userId && s.categoryId === loan.categoryId && normalize(s.name) === normalize(entry.name));
    if (subs.length !== 1) throw Error(`Missing or ambiguous dedicated subcategory: ${entry.name}`);
    const sub = subs[0];
    if (state.loans.some((l) => l.id !== loan.id && l.subcategoryId === sub.id)) throw Error(`Dedicated subcategory is shared: ${entry.name}`);
    const sourceKey = `cycle-2026-09-11|2026-09-12|LOAN_PAYMENT|${entry.paid}|MariBank|${entry.name}`;
    const id = `import_${createHash("sha256").update(`${state.userId}|${sourceKey}`).digest("hex").slice(0, 40)}`;
    const payment = { id, userId: state.userId, date: new Date("2026-09-12T00:00:00Z"), type: "LOAN_PAYMENT",
      amount: -entry.paid, accountId: state.account.id, destinationAccountId: null,
      categoryId: loan.categoryId, subcategoryId: sub.id, budgetPeriodId: state.period.id,
      description: `${entry.name} payment`, loanId: loan.id, status: "CLEARED",
      notes: `Import source: ${sourceKey}\n${entry.provenance}` };
    const existing = state.transactions.find((t) => t.id === id);
    if (existing) {
      if (existing.userId !== state.userId || existing.type !== payment.type || existing.amount !== payment.amount ||
          existing.accountId !== payment.accountId || existing.loanId !== loan.id || existing.subcategoryId !== sub.id ||
          day(existing.date) !== "2026-09-12" || normalize(existing.description) !== normalize(payment.description) ||
          existing.destinationAccountId != null || existing.budgetPeriodId !== state.period.id || existing.status !== "CLEARED") {
        throw Error(`Import key conflict: ${entry.name}`);
      }
      if (loan.openingBalance !== entry.opening || loan.subcategoryId !== sub.id) throw Error(`Previously imported opening balance conflict: ${entry.name}`);
      result.alreadyRecorded.push({ name: entry.name, recordId: existing.id, endingBalance: entry.ending });
      continue;
    }
    const probable = state.transactions.filter((t) => {
      if (t.userId !== state.userId || t.accountId !== state.account.id || Math.abs(t.amount) !== entry.paid) return false;
      const delta = Math.abs(new Date(`${day(t.date)}T00:00:00Z`) - payment.date) / 86400000;
      const merchant = normalize(t.description ?? "");
      const alias = entry.name === "SPaylater" ? /spaylater|shopeepaylater/.test(merchant) : /sloan/.test(merchant);
      return delta === 0 || (delta === 1 && (alias || t.loanId === loan.id));
    });
    if (probable.length) {
      result.probableDuplicates.push({ name: entry.name, recordIds: probable.map((t) => t.id) });
      continue;
    }
    if (loan.openingBalance !== entry.previous) throw Error(`Opening balance conflict: ${entry.name}`);
    // Legacy calculation sums every transaction on a subcategory. A dedicated
    // category must be empty before assigning it, or its history needs review.
    if (state.transactions.some((t) => t.subcategoryId === sub.id || t.loanId === loan.id)) throw Error(`Existing loan history needs review: ${entry.name}`);
    result.missing.push({ loan, openingBalance: entry.opening, endingBalance: entry.ending,
      provenance: entry.provenance, sourceKey, payment });
  }
  return result;
}
