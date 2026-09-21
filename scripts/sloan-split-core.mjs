import { createHash } from "node:crypto";
export const combinedPaymentId = "import_2693e42c6b7ef70ef6111806c71a39995db40117";
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const day = (d) => new Date(d).toISOString().slice(0, 10);
const idFor = (userId, key) => `sloan_split_${createHash("sha256").update(`${userId}|${key}`).digest("hex").slice(0, 40)}`;

export function planSloanSplit(state) {
  const loans = state.loans.filter((l) => l.userId === state.userId && !l.archivedAt && /^sloan[12]?$/.test(norm(l.name)));
  if (loans.length !== 2) throw Error("Expected exactly two separate SLoan records");
  const first = loans.find((l) => ["sloan", "sloan1"].includes(norm(l.name)));
  const second = loans.find((l) => norm(l.name) === "sloan2");
  if (!first || !second) throw Error("Ambiguous SLoan records");
  const original = state.transactions.find((t) => t.id === combinedPaymentId);
  const sourceKey = "cycle-2026-09-11|2026-09-12|LOAN_PAYMENT|153709|MariBank|SLoan 2";
  const secondId = idFor(state.userId, sourceKey);
  const secondPayment = state.transactions.find((t) => t.id === secondId);
  if (!original || original.userId !== state.userId || original.loanId !== first.id || original.type !== "LOAN_PAYMENT" ||
    day(original.date) !== "2026-09-12" || original.status !== "CLEARED" || original.budgetPeriodId !== state.period.id) throw Error("Original SLoan payment changed or missing");
  const paying = state.accounts.find((a) => a.id === original.accountId && a.userId === state.userId && norm(a.name) === "maribank");
  if (!paying) throw Error("Original payment source is not MariBank");
  const extra = state.transactions.filter((t) => t.userId === state.userId && t.id !== combinedPaymentId && t.id !== secondId &&
    ([first.id, second.id].includes(t.loanId) || (t.type === "LOAN_PAYMENT" && /sloan/.test(norm(t.description ?? "")))));
  if (extra.length) throw Error("Additional SLoan payment history needs review");
  if (first.monthlyPayment !== 1011244 || second.monthlyPayment !== 153709 || day(first.endDate) !== "2027-04-24") throw Error("Saved SLoan schedule conflict");
  const subMatches = state.subcategories.filter((s) => s.userId === state.userId && s.categoryId === second.categoryId && !s.archivedAt && norm(s.name) === "sloan2");
  if (subMatches.length > 1) throw Error("Ambiguous dedicated SLoan 2 subcategory");
  const sub = subMatches[0] ?? { id: idFor(state.userId, "subcategory|SLoan 2"), userId: state.userId,
    categoryId: second.categoryId, name: "SLoan 2" };
  if (state.loans.some((l) => l.id !== second.id && l.subcategoryId === sub.id)) throw Error("SLoan 2 subcategory is shared");
  const result = { alreadyCorrected: false, loanUpdates: [], transactionUpdate: null, newTransaction: null, newSubcategory: null,
    paymentIds: [combinedPaymentId, secondId],
    summary: { loans: [
      { name: "SLoan 1", opening: 9101200, payment: 1011244, remaining: 8089956, dueDay: first.dueDay },
      { name: "SLoan 2", opening: 1537092, payment: 153709, remaining: 1383383, dueDay: second.dueDay },
    ], combinedOpening: 10638292, combinedPayment: 1164953, combinedRemaining: 9473339 } };
  if (original.amount === -1011244 && secondPayment) {
    if (first.openingBalance !== 9101200 || second.openingBalance !== 1537092 || first.name !== "SLoan 1" || second.subcategoryId !== sub.id ||
        secondPayment.userId !== state.userId || secondPayment.loanId !== second.id || secondPayment.accountId !== original.accountId ||
        secondPayment.amount !== -153709 || secondPayment.type !== "LOAN_PAYMENT" || secondPayment.subcategoryId !== sub.id ||
        secondPayment.status !== "CLEARED" || secondPayment.budgetPeriodId !== state.period.id || day(secondPayment.date) !== "2026-09-12" ||
        day(second.endDate) !== "2027-05-15") throw Error("Previously split SLoan records changed");
    result.alreadyCorrected = true;
    return result;
  }
  if (secondPayment || original.amount !== -1164953) throw Error("Partial correction or changed payment history");
  if (first.openingBalance !== 9254909 || second.openingBalance !== 1383383) throw Error("Opening balance conflict; no correction applied");
  const remaining = (loan) => loan.openingBalance + state.transactions.filter((t) => loan.subcategoryId != null && t.subcategoryId === loan.subcategoryId).reduce((sum, t) => sum + t.amount, 0);
  if (remaining(first) !== 8089956 || remaining(second) !== 1383383) throw Error("Individual remaining balances changed since authorization");
  if (state.transactions.some((t) => t.subcategoryId === sub.id)) throw Error("SLoan 2 dedicated category has existing payment history");
  result.loanUpdates = [
    { id: first.id, before: first, data: { name: "SLoan 1", openingBalance: 9101200 } },
    { id: second.id, before: second, data: { openingBalance: 1537092, subcategoryId: sub.id, endDate: new Date("2027-05-15") } },
  ];
  result.transactionUpdate = { id: combinedPaymentId, before: original, data: { amount: -1011244, description: "SLoan 1 payment",
    notes: "Import source: cycle-2026-09-11|2026-09-12|LOAN_PAYMENT|1011244|MariBank|SLoan 1\nReplaces former combined SLoan payment of PHP 11,649.53; PHP 1,537.09 allocated to separate SLoan 2. Opening PHP 91,012.00 derived from verified remaining PHP 80,899.56 + payment PHP 10,112.44. No additional cash deduction." } };
  result.newTransaction = { id: secondId, userId: state.userId, date: new Date("2026-09-12"), type: "LOAN_PAYMENT", amount: -153709,
    accountId: original.accountId, destinationAccountId: null, categoryId: second.categoryId, subcategoryId: sub.id,
    budgetPeriodId: original.budgetPeriodId, description: "SLoan 2 payment", status: "CLEARED", loanId: second.id,
    notes: `Import source: ${sourceKey}\nSplit from existing combined payment ${combinedPaymentId}; not an additional payment. Opening PHP 15,370.92 derived from verified remaining PHP 13,833.83 + payment PHP 1,537.09.` };
  if (!subMatches.length) result.newSubcategory = sub;
  return result;
}
