import { createHash } from "node:crypto";

const DAY = "2026-09-19";
const EXPECTED_ACCOUNTS = [
  ["Cash", 1025200], ["BPI Savings", 599862], ["GCash/CIMB", 569785], ["MariBank", 138062],
  ["Maya Savings", 96447], ["GoTyme", 111], ["OwnBank", 6372], ["UnionBank Savings", 3691],
  ["ChinaBank", 3816068],
];
const EXPECTED_CARDS = [["BPI Amore", 2775624], ["UnionBank Credit Card", 5406858]];
const norm = (value) => String(value ?? "").toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9]/g, "");
const day = (value) => new Date(value).toISOString().slice(0, 10);
const stableId = (userId, kind, key) => `sep19_${kind}_${createHash("sha256").update(`${userId}|${key}`).digest("hex").slice(0, 32)}`;
const one = (rows, predicate, label) => {
  const matches = rows.filter(predicate);
  if (matches.length !== 1) throw Error(`Missing or ambiguous ${label}: ${matches.length}`);
  return matches[0];
};

function account(state, name) {
  return one(state.accounts, (row) => row.userId === state.userId && !row.archivedAt && norm(row.name) === norm(name), `account ${name}`);
}
function category(state, name) {
  return one(state.categories, (row) => row.userId === state.userId && !row.archivedAt && row.name === name, `category ${name}`);
}
function subcategory(state, categoryId, name) {
  return one(state.subcategories, (row) => row.userId === state.userId && !row.archivedAt && row.categoryId === categoryId && norm(row.name) === norm(name), `subcategory ${name}`);
}
function loan(state, name) {
  return one(state.loans, (row) => row.userId === state.userId && !row.archivedAt && row.name === name, `loan ${name}`);
}
function card(state, accountId) {
  return one(state.cards, (row) => row.userId === state.userId && row.accountId === accountId, `card for ${accountId}`);
}
function period(state) {
  const found = state.currentPeriod ?? one(state.periods, (row) => day(row.startDate) === "2026-09-11" && day(row.endDate) === "2026-10-10", "current period");
  if (day(found.startDate) !== "2026-09-11" || day(found.endDate) !== "2026-10-10") throw Error("Incorrect current period");
  return found;
}
function tx(state, key, data) {
  return {
    id: stableId(state.userId, "tx", key), userId: state.userId, date: new Date(`${DAY}T00:00:00.000Z`),
    type: data.type, amount: data.amount, accountId: data.accountId,
    destinationAccountId: data.destinationAccountId ?? null, categoryId: data.categoryId ?? null,
    subcategoryId: data.subcategoryId ?? null, budgetPeriodId: period(state).id,
    description: data.description, notes: data.notes ?? `Google Sheet sync: ${key}`,
    status: "CLEARED", linkedTransactionId: data.linkedTransactionId ?? null,
    loanId: data.loanId ?? null, creditCardId: data.creditCardId ?? null,
    cardInterestStatementDate: null,
  };
}

function paired(state, key, source, destination, amount, type, description, extra = {}) {
  const outId = stableId(state.userId, "tx", `${key}|out`);
  const inId = stableId(state.userId, "tx", `${key}|in`);
  return [
    tx(state, `${key}|out`, { ...extra, type, amount: -amount, accountId: source.id, destinationAccountId: destination.id, description, linkedTransactionId: inId }),
    tx(state, `${key}|in`, { type, amount, accountId: destination.id, destinationAccountId: source.id, description, linkedTransactionId: outId }),
  ];
}

function buildEvents(state) {
  const p = period(state);
  const bpi = account(state, "BPI Savings"), gcash = account(state, "GCash/CIMB"), mari = account(state, "MariBank");
  const ubSavings = account(state, "UnionBank Savings"), bpiCardAccount = account(state, "BPI Amore");
  const ubCardAccount = account(state, "UnionBank Credit Card");
  const bpiCard = card(state, bpiCardAccount.id), ubCard = card(state, ubCardAccount.id);
  const utilities = category(state, "Utilities/Transpo/Subscription");
  const subscriptions = subcategory(state, utilities.id, "Subscriptions"), rent = subcategory(state, utilities.id, "Rent");
  const mcwd = subcategory(state, utilities.id, "MCWD"), veco = subcategory(state, utilities.id, "VECO");
  const gloan = loan(state, "GLoan"), mariLoan = loan(state, "MariBank Loan");
  const events = [];
  events.push({ item: "chatgpt-bpi-card", rows: [tx(state, "chatgpt-bpi-card", {
    type: "EXPENSE", amount: -110000, accountId: bpiCardAccount.id, categoryId: utilities.id,
    subcategoryId: subscriptions.id, creditCardId: bpiCard.id, description: "ChatGPT subscription — BPI Amore",
  })] });
  events.push({ item: "transfer-bpi-gcash", rows: paired(state, "transfer-bpi-gcash", bpi, gcash, 800000, "TRANSFER", "Transfer BPI Savings to GCash/CIMB") });
  events.push({ item: "gloan-payment", rows: [tx(state, "gloan-payment", {
    type: "LOAN_PAYMENT", amount: -769583, accountId: gcash.id, categoryId: gloan.categoryId,
    subcategoryId: gloan.subcategoryId, loanId: gloan.id, description: "GLoan payment — GCash/CIMB",
  })], plan: { sourceType: "LOAN", sourceId: gloan.id, amount: 769583 } });
  events.push({ item: "rent", rows: [tx(state, "rent", {
    type: "EXPENSE", amount: -766400, accountId: bpi.id, categoryId: utilities.id,
    subcategoryId: rent.id, description: "Rent payment — BPI Savings",
  })] });
  events.push({ item: "transfer-bpi-maribank", rows: paired(state, "transfer-bpi-maribank", bpi, mari, 1600000, "TRANSFER", "Transfer BPI Savings to MariBank") });
  events.push({ item: "maribank-loan-payment", rows: [tx(state, "maribank-loan-payment", {
    type: "LOAN_PAYMENT", amount: -677000, accountId: mari.id, categoryId: mariLoan.categoryId,
    subcategoryId: mariLoan.subcategoryId, loanId: mariLoan.id, description: "MariBank Loan payment — MariBank",
  })], plan: { sourceType: "LOAN", sourceId: mariLoan.id, amount: 677000 } });
  events.push({ item: "mcwd", rows: [tx(state, "mcwd", { type: "EXPENSE", amount: -333640, accountId: mari.id,
    categoryId: utilities.id, subcategoryId: mcwd.id, description: "MCWD payment — MariBank" })] });
  events.push({ item: "mcwd-cashback", rows: [tx(state, "mcwd-cashback", { type: "REFUND", amount: 500, accountId: mari.id,
    categoryId: utilities.id, subcategoryId: mcwd.id, description: "MCWD cashback received — MariBank" })] });
  events.push({ item: "veco", rows: [tx(state, "veco", { type: "EXPENSE", amount: -581241, accountId: mari.id,
    categoryId: utilities.id, subcategoryId: veco.id, description: "VECO payment — MariBank" })] });
  events.push({ item: "veco-cashback", rows: [tx(state, "veco-cashback", { type: "REFUND", amount: 500, accountId: mari.id,
    categoryId: utilities.id, subcategoryId: veco.id, description: "VECO cashback received — MariBank" })] });
  events.push({ item: "bpi-card-payment", rows: paired(state, "bpi-card-payment", bpi, bpiCardAccount, 2538983,
    "CREDIT_CARD_PAYMENT", "BPI Amore statement payment — BPI Savings", { creditCardId: bpiCard.id }),
    plan: { sourceType: "CREDIT_CARD", sourceId: bpiCard.id, amount: 2538983 } });
  events.push({ item: "transfer-bpi-unionbank", rows: paired(state, "transfer-bpi-unionbank", bpi, ubSavings, 3902650,
    "TRANSFER", "Transfer BPI Savings to UnionBank Savings") });
  events.push({ item: "unionbank-card-payment", rows: paired(state, "unionbank-card-payment", ubSavings, ubCardAccount, 3902650,
    "CREDIT_CARD_PAYMENT", "UnionBank Credit Card payment — UnionBank Savings", { creditCardId: ubCard.id }),
    plan: { sourceType: "CREDIT_CARD", sourceId: ubCard.id, amount: 3902650 } });
  return { period: p, events, ubCard };
}

const comparable = ["type", "amount", "accountId", "destinationAccountId", "categoryId", "subcategoryId", "budgetPeriodId", "status", "linkedTransactionId", "loanId", "creditCardId"];
function exact(candidate, desired) {
  return day(candidate.date) === day(desired.date) && norm(candidate.description) === norm(desired.description) &&
    comparable.every((field) => (candidate[field] ?? null) === (desired[field] ?? null));
}
function partial(candidate, desired) {
  return day(candidate.date) === day(desired.date) && candidate.type === desired.type && candidate.amount === desired.amount && candidate.accountId === desired.accountId;
}

export function planSeptember19Sync(state) {
  const { period: current, events, ubCard } = buildEvents(state);
  const plan = { creates: { transactions: [], planPayments: [] }, updates: [], deletes: [], audit: [], conflicts: [] };
  const resolvedRows = new Map();
  const used = new Set();
  const addUpdate = (model, id, data) => {
    const existing = plan.updates.find((row) => row.model === model && row.id === id);
    if (existing) Object.assign(existing.data, data);
    else plan.updates.push({ model, id, data });
  };
  const preBalances = [
    ["Cash", 1025200], ["BPI Savings", 10207895], ["GCash/CIMB", 539368], ["MariBank", 128943],
    ["Maya Savings", 96447], ["GoTyme", 111], ["OwnBank", 6372], ["UnionBank Savings", 3691],
    ["ChinaBank", 3816068],
  ];
  for (const [name, expected] of preBalances) {
    const owned = account(state, name);
    const actual = owned.openingBalance + state.transactions.filter((row) => row.accountId === owned.id && day(row.date) < DAY).reduce((sum, row) => sum + row.amount, 0);
    if (actual !== expected) plan.conflicts.push({ item: `opening-${name}`, reason: `pre-September-19 balance differs: ${actual} != ${expected}`, recordIds: [owned.id] });
  }
  for (const [name, expected] of [["BPI Amore", 346641], ["UnionBank Credit Card", 1504208]]) {
    const owned = account(state, name);
    const before = owned.openingBalance + state.transactions.filter((row) => row.accountId === owned.id && day(row.date) < DAY).reduce((sum, row) => sum + row.amount, 0);
    if (before !== expected) addUpdate("account", owned.id, { openingBalance: owned.openingBalance + expected - before });
  }
  for (const event of events) {
    const stable = event.rows.map((desired) => state.transactions.find((candidate) => candidate.id === desired.id));
    if (stable.some(Boolean)) {
      if (!stable.every(Boolean) || stable.some((candidate, index) => !exact(candidate, event.rows[index]))) {
        plan.conflicts.push({ item: event.item, reason: "stable import key is partial or differs from the Sheet", recordIds: stable.filter(Boolean).map((row) => row.id) });
        continue;
      }
      resolvedRows.set(event.item, stable);
      plan.audit.push({ item: event.item, status: "alreadyRecorded", recordIds: stable.map((row) => row.id) });
      continue;
    }
    const matches = event.rows.map((desired) => state.transactions.filter((candidate) => exact(candidate, desired)));
    if (matches.every((rows) => rows.length === 1)) {
      resolvedRows.set(event.item, matches.map((rows) => rows[0]));
      plan.audit.push({ item: event.item, status: "matchedExisting", recordIds: matches.map((rows) => rows[0].id) });
      continue;
    }
    const repairMatches = event.rows.map((desired) => state.transactions.filter((candidate) => {
      if (used.has(candidate.id) || day(candidate.date) !== day(desired.date) || candidate.accountId !== desired.accountId) return false;
      if (candidate.amount === desired.amount) return true;
      if (event.item === "transfer-bpi-unionbank" && candidate.type === "TRANSFER" && Math.abs(candidate.amount) === 4000000) return true;
      if (event.item === "mcwd-cashback" && candidate.type === "REFUND" && candidate.amount === 1000) return true;
      return false;
    }));
    if (repairMatches.every((rows) => rows.length === 1) && new Set(repairMatches.map((rows) => rows[0].id)).size === event.rows.length) {
      const selected = repairMatches.map((rows) => rows[0]);
      const idMap = new Map(event.rows.map((desired, index) => [desired.id, selected[index].id]));
      const projected = selected.map((candidate, index) => {
        used.add(candidate.id);
        const desired = event.rows[index];
        const data = Object.fromEntries(comparable.map((field) => [field, field === "linkedTransactionId" && desired[field] ? idMap.get(desired[field]) : desired[field]]));
        Object.assign(data, { description: desired.description, notes: desired.notes });
        const changed = Object.entries(data).some(([field, value]) => (candidate[field] ?? null) !== (value ?? null));
        if (changed) addUpdate("transaction", candidate.id, data);
        return { ...candidate, ...data };
      });
      resolvedRows.set(event.item, projected);
      plan.audit.push({ item: event.item, status: "repairExisting", recordIds: selected.map((row) => row.id) });
      continue;
    }
    const probable = state.transactions.filter((candidate) => !used.has(candidate.id) && event.rows.some((desired) => partial(candidate, desired)));
    if (probable.length || matches.some((rows) => rows.length > 1) || repairMatches.some((rows) => rows.length > 1)) {
      plan.conflicts.push({ item: event.item, reason: "probable duplicate or partial grouped event", recordIds: probable.map((row) => row.id) });
      plan.audit.push({ item: event.item, status: "conflict", recordIds: probable.map((row) => row.id) });
      continue;
    }
    plan.creates.transactions.push(...event.rows);
    resolvedRows.set(event.item, event.rows);
    plan.audit.push({ item: event.item, status: "missing", recordIds: event.rows.map((row) => row.id) });
  }

  const bpiPaymentRows = resolvedRows.get("bpi-card-payment") ?? [];
  const bpiIncoming = bpiPaymentRows.find((row) => row.amount > 0);
  const bpiAccount = account(state, "BPI Savings"), cashAccount = account(state, "Cash");
  if (bpiIncoming) {
    const duplicates = state.transactions.filter((row) => day(row.date) === DAY && row.type === "CREDIT_CARD_PAYMENT" && row.amount === -2538983 && row.accountId === cashAccount.id && row.linkedTransactionId === bpiIncoming.id);
    if (duplicates.length > 1) plan.conflicts.push({ item: "bpi-card-payment-duplicate", reason: "multiple erroneous cash-side deductions", recordIds: duplicates.map((row) => row.id) });
    else if (duplicates.length === 1) {
      const allocations = state.planPayments.filter((row) => row.transactionId === duplicates[0].id);
      const bpiPlan = state.paymentPlans.find((row) => row.userId === state.userId && row.budgetPeriodId === current.id && row.sourceType === "CREDIT_CARD" && row.sourceId === card(state, account(state, "BPI Amore").id).id);
      const invalid = allocations.filter((row) => row.planId !== bpiPlan?.id || row.amount !== 2538983);
      if (invalid.length) plan.conflicts.push({ item: "bpi-card-payment-duplicate-link", reason: "duplicate payment is allocated outside the BPI plan", recordIds: invalid.map((row) => row.id) });
      else plan.deletes.push(...allocations.map((row) => ({ model: "planPayment", id: row.id })), { model: "transaction", id: duplicates[0].id });
    }
    const outgoing = bpiPaymentRows.find((row) => row.amount < 0);
    if (outgoing && outgoing.accountId !== bpiAccount.id) plan.conflicts.push({ item: "bpi-card-payment-source", reason: "selected payment does not originate from BPI Savings", recordIds: [outgoing.id] });
  }

  const ubPlan = one(state.paymentPlans, (row) => row.userId === state.userId && row.budgetPeriodId === current.id && row.sourceType === "CREDIT_CARD" && row.sourceId === ubCard.id, "UnionBank current plan");
  const ubPlanData = { expectedAmount: 3902650, statementAmount: 3902650, dueDate: new Date("2026-10-09T00:00:00.000Z"), dueDateStatus: "CONFIRMED" };
  if (Object.entries(ubPlanData).some(([field, value]) => field === "dueDate" ? day(ubPlan[field]) !== day(value) : ubPlan[field] !== value)) addUpdate("cyclePaymentPlan", ubPlan.id, ubPlanData);

  for (const event of events.filter((row) => row.plan)) {
    const matchingPlans = state.paymentPlans.filter((row) => row.userId === state.userId && row.budgetPeriodId === current.id && row.sourceType === event.plan.sourceType && row.sourceId === event.plan.sourceId);
    if (!matchingPlans.length && event.plan.sourceType === "LOAN") {
      plan.audit.push({ item: `${event.item}-plan-link`, status: "automaticLoanMatch", recordIds: [] });
      continue;
    }
    if (matchingPlans.length !== 1) {
      plan.conflicts.push({ item: `${event.item}-plan-link`, reason: `missing or ambiguous payment plan: ${matchingPlans.length}`, recordIds: matchingPlans.map((row) => row.id) });
      continue;
    }
    const paymentPlan = matchingPlans[0];
    const paymentTx = resolvedRows.get(event.item)?.find((row) => row.amount < 0);
    if (!paymentTx) continue;
    const existing = state.planPayments.filter((row) => row.transactionId === paymentTx.id);
    if (existing.length > 1 || (existing.length === 1 && (existing[0].planId !== paymentPlan.id || existing[0].amount !== event.plan.amount))) {
      plan.conflicts.push({ item: `${event.item}-plan-link`, reason: "payment transaction is allocated differently", recordIds: existing.map((row) => row.id) });
    } else if (!existing.length) {
      plan.creates.planPayments.push({ id: stableId(state.userId, "plan", event.item), userId: state.userId,
        planId: paymentPlan.id, transactionId: paymentTx.id, amount: event.plan.amount });
    }
  }
  return plan;
}

export function projectSeptember19Sync(state, plan) {
  const projected = structuredClone(state);
  for (const deletion of plan.deletes ?? []) {
    if (deletion.model === "transaction") projected.transactions = projected.transactions.filter((row) => row.id !== deletion.id);
    else if (deletion.model === "planPayment") projected.planPayments = projected.planPayments.filter((row) => row.id !== deletion.id);
    else throw Error(`Cannot project deletion ${deletion.model}`);
  }
  projected.transactions = [...projected.transactions, ...structuredClone(plan.creates.transactions)];
  projected.planPayments = [...projected.planPayments, ...structuredClone(plan.creates.planPayments)];
  for (const update of plan.updates) {
    const collection = update.model === "cyclePaymentPlan" ? projected.paymentPlans : update.model === "transaction" ? projected.transactions : update.model === "account" ? projected.accounts : null;
    const row = collection?.find((item) => item.id === update.id);
    if (!row) throw Error(`Cannot project ${update.model} ${update.id}`);
    Object.assign(row, update.data);
  }
  return projected;
}

function balance(state, accountId) {
  const owned = one(state.accounts, (row) => row.id === accountId, `account ${accountId}`);
  return owned.openingBalance + state.transactions.filter((row) => row.accountId === accountId).reduce((sum, row) => sum + row.amount, 0);
}

export function summarizeSeptember19Sync(state) {
  const accounts = EXPECTED_ACCOUNTS.map(([name, expected]) => {
    const owned = account(state, name);
    const calculated = balance(state, owned.id);
    return { name: name === "ChinaBank" ? "China Bank Checking" : name, calculated, expected, difference: calculated - expected };
  });
  const usableFunds = accounts.filter((row) => row.name !== "China Bank Checking").reduce((sum, row) => sum + row.calculated, 0);
  const chinaBank = accounts.find((row) => row.name === "China Bank Checking").calculated;
  const cards = EXPECTED_CARDS.map(([name, expected]) => {
    const owned = account(state, name);
    const availableCredit = balance(state, owned.id);
    return { name, availableCredit, expected, difference: availableCredit - expected };
  });
  const current = period(state);
  const currentPlans = state.paymentPlans.filter((row) => row.userId === state.userId && row.budgetPeriodId === current.id);
  const allocatedTransactionIds = new Set(state.planPayments.map((row) => row.transactionId));
  const currentUnpaidPlans = currentPlans.map((plan) => {
    const linked = state.planPayments.filter((row) => row.planId === plan.id).reduce((sum, row) => sum + row.amount, 0);
    const automatic = state.transactions.filter((row) => row.userId === state.userId && row.budgetPeriodId === current.id && row.amount < 0 && !allocatedTransactionIds.has(row.id) &&
      (plan.sourceType === "LOAN" ? row.type === "LOAN_PAYMENT" && row.loanId === plan.sourceId : row.type === "CREDIT_CARD_PAYMENT" && row.creditCardId === plan.sourceId))
      .reduce((sum, row) => sum + Math.abs(row.amount), 0);
    const actual = linked + automatic;
    return { id: plan.id, sourceType: plan.sourceType, sourceId: plan.sourceId, expected: plan.expectedAmount, actual, remaining: Math.max(0, plan.expectedAmount - actual) };
  }).filter((row) => row.remaining > 0);
  const onDay = state.transactions.filter((row) => row.userId === state.userId && day(row.date) === DAY);
  const currentExpenses = onDay.filter((row) => ["EXPENSE", "REFUND"].includes(row.type)).reduce((sum, row) => sum - row.amount, 0);
  return { accounts, usableFunds, chinaBank, totalIncludingChinaBank: usableFunds + chinaBank, cards, currentUnpaidPlans, currentExpenses,
    transactionCounts: Object.fromEntries([...new Set(onDay.map((row) => row.type))].sort().map((type) => [type, onDay.filter((row) => row.type === type).length])) };
}
