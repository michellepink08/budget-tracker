import { createHash } from "node:crypto";
import { planSloanSplit, combinedPaymentId } from "./sloan-split-core.mjs";

const norm = (s) => s.toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9]/g, "");
const day = (date) => new Date(date).toISOString().slice(0, 10);
const stable = (userId, key) => `sept_${createHash("sha256").update(`${userId}|${key}`).digest("hex").slice(0, 40)}`;
const one = (rows, predicate, label) => {
  const matches = rows.filter(predicate);
  if (matches.length !== 1) throw Error(`Missing or ambiguous ${label}`);
  return matches[0];
};
const account = (s, name) => one(s.accounts, (a) => a.userId === s.userId && !a.archivedAt && norm(a.name) === norm(name), name);
const category = (s, name) => one(s.categories, (a) => a.userId === s.userId && !a.archivedAt && a.name === name, name);
const subcategory = (s, categoryId, name) => one(s.subcategories, (a) => a.userId === s.userId && !a.archivedAt && a.categoryId === categoryId && a.name === name, name);

export const expectedAccounts = [
  ["BPI Savings", 2591550, 11207895], ["MariBank", 130656, 128943], ["Maya Savings", 83398, 96447],
  ["GCash/CIMB", 357715, 539368], ["Cash", 323000, 147100], ["ChinaBank", 1316068, 3816068],
];

// Source item numbers are the user's original 27-item list. All money is
// literal integer centavos. Historical receivables are tracked separately.
export const sources = [
  [1, 11, "INCOME", 4377574, "BPI Savings", "Allotment", "Income", "Allotment"],
  [2, 11, "INCOME", 9654103, "BPI Savings", "Papa's salary", "Income", "Papa's Salary"],
  [3, 12, "TRANSFER", 3500000, "BPI Savings", "Transfer to MariBank", null, null, "MariBank"],
  [4, 12, "TRANSFER", 500000, "BPI Savings", "Transfer to GCash/CIMB", null, null, "GCash/CIMB"],
  [5, 12, "LOAN_PAYMENT", 2137360, "MariBank", "SPaylater payment", "Loan", "SPaylater"],
  [6, 12, "LOAN_PAYMENT", 1164953, "MariBank", "SLoan payment", "Loan", "SLoan"],
  [7, 12, "LOAN_PAYMENT", 289357, "GCash/CIMB", "GGives payment", "Loan", "GGives"],
  [8, 12, "EXPENSE", 179900, "MariBank", "PLDT internet bill", "Utilities/Transpo/Subscription", "PLDT"],
  [9, 12, "REFUND", 500, "MariBank", "PLDT cashback", "Utilities/Transpo/Subscription", "PLDT"],
  [10, 12, "TRANSFER", 1400000, "BPI Savings", "Transfer to Maya Savings", null, null, "Maya Savings"],
  [11, 12, "LOAN_PAYMENT", 637547, "Maya Savings", "Maya Loan payment", "Loan", "Maya Loan"],
  [12, 12, "CREDIT_CARD_PAYMENT", 749404, "Maya Savings", "Maya Credit Card payment", null, null, "Maya Credit Card"],
  [13, 12, "TRANSFER", 2500000, "BPI Savings", "Transfer to ChinaBank", null, null, "ChinaBank"],
  [14, 13, "EXPENSE", 107332, "Maya Credit Card", "Claude subscription", "Utilities/Transpo/Subscription", "Subscriptions"],
  [15, 13, "EXPENSE", 109900, "Cash", "Market purchases", "Home & Groceries", "Market / Grocery / Food"],
  [16, 14, "TRANSFER", 200000, "BPI Savings", "Transfer to GCash/CIMB", null, null, "GCash/CIMB"],
  [17, 14, "EXPENSE", 146300, "GCash/CIMB", "Food order", "Home & Groceries", "Market / Grocery / Food"],
  [18, 14, "EXPENSE", 28700, "GCash/CIMB", "Food order", "Home & Groceries", "Market / Grocery / Food"],
  [19, 15, "EXPENSE", 35879, "Maya Credit Card", "Claude subscription", "Utilities/Transpo/Subscription", "Subscriptions"],
  [20, 15, "LENDING", 50000, "GCash/CIMB", "Mama borrowed money"],
  [21, 15, "EXPENSE", 50000, "Cash", "Trash payment", "Home & Groceries", "Miscellaneous"],
  [22, 15, "EXPENSE", 16000, "Cash", "Food purchase", "Home & Groceries", "Market / Grocery / Food"],
  [23, 16, "INCOME", 2404668, "BPI Savings", "Engage salary", "Income", "Engage"],
  [24, 16, "RECEIVABLE_REPAYMENT", 150000, "BPI Savings", "Mama repayment"],
  [25, 16, "RECEIVABLE_REPAYMENT", 130000, "BPI Savings", "Mama paid 9/13 TZ30 receivable"],
  [26, 16, "EXPENSE", 20000, "MariBank", "School expense", "Home & Groceries", "School Needs"],
  [27, 16, "EXPENSE", 3990, "GCash/CIMB", "Miscellaneous expense", "Home & Groceries", "Miscellaneous"],
].map(([item, dateDay, type, amount, accountName, description, categoryName, subcategoryName, destinationName]) =>
  ({ item, date: `2026-09-${dateDay}`, type, amount, accountName, description, categoryName, subcategoryName, destinationName }));

const protectedIds = {
  1: "cmu3ewz03000004kzqarwzjhx", 2: "cmu3f0spa000004jnja9jnrij",
  5: "import_52fecd94f27d019d74e443aad0d8545eec598b3e", 6: "import_2693e42c6b7ef70ef6111806c71a39995db40117",
};
const receivableSpecs = [
  { key: "mama-2026-08-27-bpi", date: "2026-08-27", amount: 50000, accountName: "BPI Savings", reference: "Mama | Aug 27 BPI", historical: true },
  { key: "mama-2026-08-28-gcash", date: "2026-08-28", amount: 50000, accountName: "GCash/CIMB", reference: "Mama | Aug 28 GCash", historical: true },
  { key: "mama-2026-09-15-gcash", date: "2026-09-15", amount: 50000, accountName: "GCash/CIMB", reference: "Mama | Sep 15 GCash", historical: false },
  { key: "mama-tz30-2026-09-13", date: "2026-09-13", amount: 130000, accountName: null, reference: "Mama | 9/13 TZ30", historical: true },
];

export function planSeptemberImport(state) {
  const result = { audit: [], creates: { category: [], subcategory: [], lending: [], transaction: [] }, loanUpdates: [], unresolved: [] };
  if (day(state.period.startDate) !== "2026-09-11" || day(state.period.endDate) !== "2026-10-10") throw Error("Incorrect cycle");
  for (const [name, opening] of expectedAccounts) {
    if (account(state, name).openingBalance !== opening) result.unresolved.push({ reason: `Account opening conflict: ${name}` });
  }
  const lendCats = state.categories.filter((c) => c.userId === state.userId && c.name === "Lending" && !c.archivedAt);
  if (lendCats.length > 1) throw Error("Ambiguous Lending category");
  const lendingCategory = lendCats[0] ?? { id: stable(state.userId, "category|Lending"), userId: state.userId,
    name: "Lending", type: "INCOME", color: "coral", icon: "tag" };
  if (!lendCats.length) result.creates.category.push(lendingCategory);
  const lendings = [];
  const resolvedIds = new Map();
  for (const spec of receivableSpecs) {
    const subId = stable(state.userId, `subcategory|${spec.key}`);
    const lendingId = stable(state.userId, `receivable|${spec.key}`);
    const existingSub = state.subcategories.find((s) => s.id === subId);
    if (!existingSub) result.creates.subcategory.push({ id: subId, userId: state.userId, categoryId: lendingCategory.id, name: spec.reference });
    else if (existingSub.userId !== state.userId || existingSub.categoryId !== lendingCategory.id || existingSub.name !== spec.reference) throw Error("Receivable subcategory key conflict");
    const row = { id: lendingId, userId: state.userId, borrowerName: "Mama", kind: "CASH", amount: spec.amount,
      date: new Date(spec.date), accountId: spec.accountName ? account(state, spec.accountName).id : null,
      categoryId: lendingCategory.id, subcategoryId: subId };
    const existing = state.lendings.find((l) => l.id === lendingId);
    if (!existing) {
      const probable = state.lendings.filter((l) => l.userId === state.userId && norm(l.borrowerName) === "mama" && l.amount === spec.amount && day(l.date) === spec.date);
      if (probable.length) result.unresolved.push({ reason: `Probable existing receivable: ${spec.reference}`, recordIds: probable.map((l) => l.id) });
      else result.creates.lending.push(row);
    } else if (existing.amount !== row.amount || existing.subcategoryId !== subId || existing.accountId !== row.accountId || existing.userId !== state.userId || day(existing.date) !== spec.date || existing.borrowerName !== "Mama" || existing.kind !== "CASH") throw Error("Receivable import key conflict");
    lendings.push(row);
  }
  for (const source of sources) {
    const a = account(state, source.accountName);
    const dest = source.destinationName ? account(state, source.destinationName) : null;
    const key = `cycle-2026-09-11|${source.date}|${source.type}|${source.amount}|${source.accountName}|${source.destinationName ?? source.description}`;
    const mainId = stable(state.userId, key);
    const make = (suffix, data) => ({ id: suffix ? stable(state.userId, `${key}|${suffix}`) : mainId,
      userId: state.userId, date: new Date(source.date), type: source.type, amount: source.amount,
      accountId: a.id, budgetPeriodId: state.period.id, description: source.description, status: "CLEARED",
      destinationAccountId: null, categoryId: null, subcategoryId: null, linkedTransactionId: null,
      loanId: null, creditCardId: null, notes: `Import source: ${key}${suffix ? ` | ${suffix}` : ""}`,
      ...data });
    if (source.item === 6 && state.transactions.find((t) => t.id === combinedPaymentId)?.amount === -1011244) {
      const split = planSloanSplit(state);
      if (!split.alreadyCorrected) throw Error("Incomplete SLoan split");
      result.audit.push({ item: 6, description: "SLoan 1 and SLoan 2 separate payments", status: "preserved",
        recordIds: split.paymentIds, reason: "User-corrected split: PHP 10,112.44 and PHP 1,537.09; combined PHP 11,649.53" });
      resolvedIds.set(6, split.paymentIds);
      continue;
    }
    if (protectedIds[source.item]) {
      const t = state.transactions.find((t) => t.id === protectedIds[source.item]);
      const expectedAmount = source.type === "INCOME" ? source.amount : -source.amount;
      if (!t || t.userId !== state.userId || t.accountId !== a.id || t.amount !== expectedAmount || t.type !== source.type || day(t.date) !== source.date || t.status !== "CLEARED") throw Error(`Protected existing item changed: ${source.item}`);
      if (source.type === "LOAN_PAYMENT") {
        const loan = one(state.loans, (l) => l.id === t.loanId && norm(l.name) === norm(source.subcategoryName), source.subcategoryName);
        const opening = source.item === 5 ? 7056914 : 9254909;
        if (loan.openingBalance !== opening || loan.subcategoryId !== t.subcategoryId) throw Error("Completed loan correction changed");
      }
      result.audit.push({ item: source.item, description: source.description, status: "preserved", recordIds: [t.id], reason: source.type === "INCOME" ? "Previously approved probable match: generic Income description" : "Completed loan payment; untouched" });
      resolvedIds.set(source.item, [t.id]);
      continue;
    }
    const rows = [];
    if (source.type === "TRANSFER" || source.type === "CREDIT_CARD_PAYMENT") {
      const incomingId = stable(state.userId, `${key}|incoming`);
      const card = source.type === "CREDIT_CARD_PAYMENT" ? one(state.cards, (c) => c.accountId === dest.id && c.userId === state.userId, "Maya card") : null;
      rows.push(make("", { amount: -source.amount, destinationAccountId: dest.id, linkedTransactionId: incomingId, creditCardId: card?.id ?? null }));
      rows.push(make("incoming", { accountId: dest.id, destinationAccountId: a.id, linkedTransactionId: mainId }));
    } else if (source.type === "RECEIVABLE_REPAYMENT") {
      const allocations = source.item === 24 ? lendings.slice(0, 3) : lendings.slice(3);
      for (const lending of allocations) rows.push(make(`allocation|${lending.id}`, { amount: lending.amount,
        categoryId: lending.categoryId, subcategoryId: lending.subcategoryId,
        description: `${source.description} — ${receivableSpecs.find((s) => stable(state.userId, `receivable|${s.key}`) === lending.id).reference}`,
        notes: `Import source: ${key}\nRepayment allocation for receivable ${lending.id}; not income.` }));
    } else if (source.type === "LENDING") {
      const lending = lendings[2];
      rows.push(make("", { amount: -source.amount, categoryId: lending.categoryId, subcategoryId: lending.subcategoryId,
        notes: `Import source: ${key}\nReceivable ${lending.id}. Real September 15 cash outflow.` }));
    } else {
      const cat = category(state, source.categoryName);
      const sub = subcategory(state, cat.id, source.subcategoryName);
      const fields = { categoryId: cat.id, subcategoryId: sub.id, amount: ["INCOME", "REFUND"].includes(source.type) ? source.amount : -source.amount };
      if (source.type === "LOAN_PAYMENT") {
        const loan = one(state.loans, (l) => l.userId === state.userId && !l.archivedAt && l.name === source.subcategoryName, source.subcategoryName);
        if (state.loans.some((l) => l.id !== loan.id && l.subcategoryId === sub.id)) throw Error(`Dedicated loan category shared: ${loan.name}`);
        if (loan.openingBalance !== (source.item === 7 ? 4340355 : 5225138)) throw Error(`Loan opening conflict: ${loan.name}`);
        fields.loanId = loan.id;
        if (loan.subcategoryId !== sub.id) {
          if (state.transactions.some((t) => t.subcategoryId === sub.id || t.loanId === loan.id)) throw Error(`Loan history needs review: ${loan.name}`);
          result.loanUpdates.push({ id: loan.id, before: loan, data: { subcategoryId: sub.id } });
        }
      }
      if (source.item === 9) {
        const billSource = sources.find((s) => s.item === 8);
        const billKey = `cycle-2026-09-11|${billSource.date}|EXPENSE|179900|MariBank|PLDT internet bill`;
        fields.linkedTransactionId = resolvedIds.get(8)?.[0] ?? stable(state.userId, billKey);
      }
      rows.push(make("", fields));
    }
    const existingById = rows.map((r) => state.transactions.find((t) => t.id === r.id));
    if (existingById.some(Boolean)) {
      if (!existingById.every(Boolean)) throw Error(`Partial imported event: ${source.item}`);
      for (let i = 0; i < rows.length; i++) {
        for (const field of ["userId", "type", "amount", "accountId", "destinationAccountId", "categoryId", "subcategoryId", "budgetPeriodId", "description", "status", "linkedTransactionId", "loanId", "creditCardId"]) {
          if ((existingById[i][field] ?? null) !== (rows[i][field] ?? null)) throw Error(`Import key conflict item ${source.item}: ${field}`);
        }
        if (day(existingById[i].date) !== source.date) throw Error("Imported date conflict");
      }
      result.audit.push({ item: source.item, description: source.description, status: "alreadyRecorded", recordIds: existingById.map((t) => t.id) });
      resolvedIds.set(source.item, existingById.map((t) => t.id));
      continue;
    }
    // Manual exact matches remain untouched. Require every allocation/leg,
    // and validate actual reciprocal links rather than our proposed IDs.
    const exact = rows.map((r) => state.transactions.filter((t) => day(t.date) === source.date && norm(t.description ?? "") === norm(r.description) &&
      ["userId", "type", "amount", "accountId", "destinationAccountId", "categoryId", "subcategoryId", "budgetPeriodId", "status", "loanId", "creditCardId"]
        .every((field) => (t[field] ?? null) === (r[field] ?? null))));
    const exactPairLinked = rows.length !== 2 || !["TRANSFER", "CREDIT_CARD_PAYMENT"].includes(source.type) ||
      (exact[0][0]?.linkedTransactionId === exact[1][0]?.id && exact[1][0]?.linkedTransactionId === exact[0][0]?.id);
    if (exact.every((matches) => matches.length === 1) && exactPairLinked) {
      result.audit.push({ item: source.item, description: source.description, status: "alreadyRecorded", recordIds: exact.map((matches) => matches[0].id) });
      resolvedIds.set(source.item, exact.map((matches) => matches[0].id));
      continue;
    }
    const aliases = (text) => norm(text).replace(/shopeepaylater/g, "spaylater").replace(/mayacc/g, "mayacreditcard").replace(/seabank/g, "maribank");
    const probable = state.transactions.filter((t) => {
      if (t.userId !== state.userId) return false;
      const isIncomingLeg = dest && t.accountId === dest.id &&
        (t.destinationAccountId === a.id || state.transactions.some((other) => other.id === t.linkedTransactionId && other.accountId === a.id));
      if (t.accountId !== a.id && !isIncomingLeg) return false;
      const isAllocation = source.type === "RECEIVABLE_REPAYMENT" && rows.some((r) => r.subcategoryId === t.subcategoryId && r.amount === t.amount);
      const amountMatch = Math.abs(t.amount) === source.amount || isAllocation || ([17, 18].includes(source.item) && Math.abs(t.amount) === 175000);
      if (!amountMatch) return false;
      const delta = Math.abs(new Date(day(t.date)) - new Date(source.date)) / 86400000;
      return delta === 0 || (delta === 1 && (aliases(t.description ?? "").includes(aliases(source.description)) || aliases(source.description).includes(aliases(t.description ?? ""))));
    });
    if (probable.length) {
      const issue = { item: source.item, reason: "Probable duplicate; do not insert", recordIds: probable.map((t) => t.id) };
      result.unresolved.push(issue);
      result.audit.push({ ...issue, description: source.description, status: "probableDuplicate" });
    } else {
      result.creates.transaction.push(...rows);
      resolvedIds.set(source.item, rows.map((t) => t.id));
      result.audit.push({ item: source.item, description: source.description, status: "missing", recordIds: rows.map((t) => t.id) });
    }
  }
  return result;
}

export function summarizeSeptemberImport(state) {
  const rows = state.transactions.filter((t) => t.userId === state.userId && t.budgetPeriodId === state.period.id);
  const sum = (type, sign) => rows.filter((t) => t.type === type && (!sign || Math.sign(t.amount) === sign)).reduce((total, t) => total + Math.abs(t.amount), 0);
  const card = account(state, "Maya Credit Card");
  const cardRecord = one(state.cards, (c) => c.userId === state.userId && c.accountId === card.id, "Maya card");
  const available = card.openingBalance + state.transactions.filter((t) => t.accountId === card.id).reduce((sum, t) => sum + t.amount, 0);
  const receivables = state.lendings.filter((l) => l.borrowerName === "Mama").map((l) => ({ id: l.id,
    reference: state.subcategories.find((s) => s.id === l.subcategoryId)?.name, amount: l.amount,
    outstanding: Math.max(0, l.amount - state.transactions.filter((t) => t.userId === state.userId && t.subcategoryId === l.subcategoryId && t.amount > 0).reduce((sum, t) => sum + t.amount, 0)) }));
  return {
    accounts: expectedAccounts.map(([name, , expected]) => {
      const a = account(state, name);
      const calculated = a.openingBalance + state.transactions.filter((t) => t.accountId === a.id).reduce((sum, t) => sum + t.amount, 0);
      return { name, calculated, expected, difference: calculated - expected };
    }),
    income: sum("INCOME"), grossExpenses: sum("EXPENSE"), refunds: sum("REFUND"), netExpenses: sum("EXPENSE") - sum("REFUND"),
    transfers: sum("TRANSFER", -1), loanPayments: sum("LOAN_PAYMENT", -1), cardPayments: sum("CREDIT_CARD_PAYMENT", -1),
    receivableRepayments: sum("RECEIVABLE_REPAYMENT"), cardPurchases: rows.filter((t) => t.accountId === card.id && t.type === "EXPENSE").reduce((sum, t) => sum - t.amount, 0),
    cardAvailable: available, cardOutstanding: cardRecord.creditLimit - available, receivables,
    receivableOutstanding: receivables.reduce((sum, l) => sum + l.outstanding, 0),
    loans: state.loans.filter((l) => !l.archivedAt).map((l) => ({ id: l.id, name: l.name,
      remaining: Math.max(0, l.openingBalance + state.transactions.filter((t) => l.subcategoryId != null && t.subcategoryId === l.subcategoryId).reduce((sum, t) => sum + t.amount, 0)) })),
  };
}
