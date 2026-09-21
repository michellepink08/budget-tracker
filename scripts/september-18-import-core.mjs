import { createHash } from "node:crypto";

const norm = (value) => String(value ?? "").toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9]/g, "");
const day = (value) => new Date(value).toISOString().slice(0, 10);
const idFor = (userId, key) => `sept18_${createHash("sha256").update(`${userId}|${key}`).digest("hex").slice(0, 40)}`;
const one = (rows, predicate, label) => {
  const matches = rows.filter(predicate);
  if (matches.length !== 1) throw Error(`Missing or ambiguous ${label}`);
  return matches[0];
};

const targetAccounts = [
  ["Cash", 1025200], ["BPI Savings", 10207895], ["GCash/CIMB", 539368], ["MariBank", 128943],
  ["Maya Savings", 96447], ["GoTyme", 111], ["OwnBank", 6372], ["UnionBank Savings", 3691], ["ChinaBank", 3816068],
];

function account(state, name) {
  return one(state.accounts, (row) => row.userId === state.userId && !row.archivedAt && norm(row.name) === norm(name), name);
}
function category(state, name) {
  return one(state.categories, (row) => row.userId === state.userId && !row.archivedAt && row.name === name, `category ${name}`);
}
function subcategory(state, categoryName, name) {
  const parent = category(state, categoryName);
  return one(state.subcategories, (row) => row.userId === state.userId && !row.archivedAt && row.categoryId === parent.id && row.name === name, `${categoryName} / ${name}`);
}
function balance(state, accountId) {
  const row = state.accounts.find((item) => item.id === accountId);
  return row.openingBalance + state.transactions.filter((item) => item.accountId === accountId).reduce((sum, item) => sum + item.amount, 0);
}

function row(state, key, data) {
  return {
    id: idFor(state.userId, key), userId: state.userId, date: new Date(data.date), type: data.type,
    amount: data.amount, accountId: data.accountId, destinationAccountId: data.destinationAccountId ?? null,
    categoryId: data.categoryId ?? null, subcategoryId: data.subcategoryId ?? null,
    budgetPeriodId: data.budgetPeriodId, description: data.description, notes: data.notes ?? `Import source: ${key}`,
    status: "CLEARED", linkedTransactionId: data.linkedTransactionId ?? null, loanId: null,
    creditCardId: data.creditCardId ?? null, cardInterestStatementDate: null,
  };
}

function buildEvents(state) {
  if (day(state.currentPeriod.startDate) !== "2026-09-11" || day(state.currentPeriod.endDate) !== "2026-10-10") throw Error("Incorrect current cycle");
  if (day(state.priorPeriod.startDate) !== "2026-08-11" || day(state.priorPeriod.endDate) !== "2026-09-10") throw Error("Incorrect prior cycle");
  const cash = account(state, "Cash"), bpi = account(state, "BPI Savings"), eastWest = account(state, "EastWest Credit Card");
  const card = one(state.cards, (item) => item.userId === state.userId && item.accountId === eastWest.id, "EastWest card");
  const home = category(state, "Home & Groceries"), utilities = category(state, "Utilities/Transpo/Subscription");
  const savings = category(state, "Savings"), health = category(state, "Health");
  const food = subcategory(state, "Home & Groceries", "Market / Grocery / Food");
  const rice = subcategory(state, "Home & Groceries", "Rice");
  const snacks = subcategory(state, "Home & Groceries", "Kid's School Snacks");
  const care = subcategory(state, "Home & Groceries", "Personal Care");
  const miscellaneous = subcategory(state, "Home & Groceries", "Miscellaneous");
  const transportation = subcategory(state, "Utilities/Transpo/Subscription", "Transportation");
  const improvement = subcategory(state, "Savings", "Home Improvement");
  const hospital = subcategory(state, "Health", "Hospital");
  const expense = (key, amount, acc, description, parent, sub, extra = {}) => row(state, key, {
    date: extra.date ?? "2026-09-18", type: "EXPENSE", amount: -amount, accountId: acc.id,
    categoryId: parent.id, subcategoryId: sub.id, budgetPeriodId: extra.periodId ?? state.currentPeriod.id,
    description, creditCardId: extra.card ? card.id : null, notes: extra.notes,
  });
  const historical = [
    expense("historical-eastwest-2026-09-06-3000000", 3000000, eastWest, "Hospital deposit", health, hospital,
      { date: "2026-09-06", periodId: state.priorPeriod.id, card: true, notes: "Historical Health/Hospital expense; EastWest liability only; no cash movement." }),
    expense("historical-eastwest-2026-09-10-1551914", 1551914, eastWest, "Hospital remaining balance", health, hospital,
      { date: "2026-09-10", periodId: state.priorPeriod.id, card: true, notes: "Historical Health/Hospital expense; EastWest liability only; no cash movement." }),
  ];
  const mixedGroup = "sept18-eastwest-mixed-1604685";
  const mixed = [
    [1304685, food], [65000, rice], [135000, snacks], [100000, care],
  ].map(([amount, sub], index) => expense(`${mixedGroup}|${index + 1}|${sub.name}`, amount, eastWest,
    `Gaisano mixed purchase — ${sub.name}`, home, sub,
    { card: true, notes: `Import group: ${mixedGroup}\nMerchant: Maya/Gaisano Grand Tabunok\nAllocation ${index + 1} of 4; combined purchase PHP 16,046.85.` }));
  const outgoingId = idFor(state.userId, "withdrawal-bpi-to-cash-1000000|outgoing");
  const incomingId = idFor(state.userId, "withdrawal-bpi-to-cash-1000000|incoming");
  const withdrawal = [
    row(state, "withdrawal-bpi-to-cash-1000000|outgoing", { date: "2026-09-18", type: "TRANSFER", amount: -1000000,
      accountId: bpi.id, destinationAccountId: cash.id, budgetPeriodId: state.currentPeriod.id,
      description: "Cash withdrawal", linkedTransactionId: incomingId, notes: "BPI Savings to Cash; no transaction fee." }),
    row(state, "withdrawal-bpi-to-cash-1000000|incoming", { date: "2026-09-18", type: "TRANSFER", amount: 1000000,
      accountId: cash.id, destinationAccountId: bpi.id, budgetPeriodId: state.currentPeriod.id,
      description: "Cash withdrawal", linkedTransactionId: outgoingId, notes: "BPI Savings to Cash; no transaction fee." }),
  ];
  return [
    { item: "historical-eastwest-09-06", historical: true, rows: [historical[0]] },
    { item: "historical-eastwest-09-10", historical: true, rows: [historical[1]] },
    { item: "28-comforter", rows: [expense("comforter-139800", 139800, eastWest, "Comforter", savings, improvement,
      { card: true, notes: "Merchant: Maya/Gaisano Grand Tabunok\nImport source: September 18 comforter." })] },
    ...[[35000, "350"], [18400, "184"], [15800, "158"], [10000, "100"]].map(([amount, label]) => ({
      item: `29-cash-food-${label}`, rows: [expense(`cash-food-${label}`, amount, cash, `Cash food purchase — PHP ${label}`, home, food)],
    })),
    { item: "30-transportation", rows: [expense("cash-transportation-20000", 20000, cash, "Transportation", utilities, transportation)] },
    { item: "31-eastwest-mixed", rows: mixed },
    { item: "32-cash-withdrawal", rows: withdrawal },
    { item: "33-cash-reconciliation", rows: [expense("cash-reconciliation-22700", 22700, cash,
      "Untracked cash purchase identified during balance reconciliation", home, miscellaneous)] },
  ];
}

const comparable = ["userId", "type", "amount", "accountId", "destinationAccountId", "categoryId", "subcategoryId", "budgetPeriodId", "status", "linkedTransactionId", "loanId", "creditCardId"];
function exactMatches(state, desired, historical) {
  return state.transactions.filter((candidate) => {
    if (day(candidate.date) !== day(desired.date) || comparable.some((field) => (candidate[field] ?? null) !== (desired[field] ?? null))) return false;
    return historical || norm(candidate.description) === norm(desired.description);
  });
}

export function planSeptember18Import(state) {
  const result = { creates: [], audit: [], unresolved: [] };
  for (const event of buildEvents(state)) {
    const stableRows = event.rows.map((desired) => state.transactions.find((candidate) => candidate.id === desired.id));
    if (stableRows.some(Boolean)) {
      if (!stableRows.every(Boolean)) throw Error(`Partial stable import group: ${event.item}`);
      for (let index = 0; index < event.rows.length; index++) {
        if (!exactMatches({ ...state, transactions: [stableRows[index]] }, event.rows[index], false).length || day(stableRows[index].date) !== day(event.rows[index].date)) throw Error(`Import key conflict: ${event.item}`);
      }
      result.audit.push({ item: event.item, status: "alreadyRecorded", recordIds: stableRows.map((item) => item.id) });
      continue;
    }
    const exact = event.rows.map((desired) => exactMatches(state, desired, event.historical));
    if (exact.every((matches) => matches.length === 1)) {
      const linked = event.rows.length !== 2 || event.rows[0].type !== "TRANSFER" ||
        (exact[0][0].linkedTransactionId === exact[1][0].id && exact[1][0].linkedTransactionId === exact[0][0].id);
      if (linked) {
        result.audit.push({ item: event.item, status: event.historical ? "preserved" : "alreadyRecorded", recordIds: exact.map((matches) => matches[0].id) });
        continue;
      }
    }
    const probable = state.transactions.filter((candidate) => event.rows.some((desired) =>
      candidate.userId === state.userId && candidate.accountId === desired.accountId && day(candidate.date) === day(desired.date) &&
      candidate.type === desired.type && Math.abs(candidate.amount) === Math.abs(desired.amount)));
    if (probable.length) {
      result.unresolved.push({ item: event.item, reason: "Probable duplicate or partial grouped event; no rows inserted", recordIds: probable.map((item) => item.id) });
      result.audit.push({ item: event.item, status: "probableDuplicate", recordIds: probable.map((item) => item.id) });
      continue;
    }
    result.creates.push(...event.rows);
    result.audit.push({ item: event.item, status: "missing", recordIds: event.rows.map((item) => item.id) });
  }
  return result;
}

export function projectSeptember18Import(state, plan) {
  return { ...structuredClone(state), transactions: [...structuredClone(state.transactions), ...structuredClone(plan.creates)] };
}

export function summarizeSeptember18Import(state) {
  const accounts = targetAccounts.map(([name, expected]) => {
    const owned = account(state, name);
    const calculated = balance(state, owned.id);
    return { name: name === "ChinaBank" ? "China Bank Checking" : name, calculated, expected, difference: calculated - expected };
  });
  const eastWestAccount = account(state, "EastWest Credit Card");
  const eastWestCard = one(state.cards, (item) => item.userId === state.userId && item.accountId === eastWestAccount.id, "EastWest card");
  const september18 = state.transactions.filter((item) => item.userId === state.userId && day(item.date) === "2026-09-18");
  const newCharges = september18.filter((item) => item.accountId === eastWestAccount.id && item.type === "EXPENSE").reduce((sum, item) => sum - item.amount, 0);
  const available = balance(state, eastWestAccount.id);
  return {
    accounts,
    totalMoney: accounts.reduce((sum, item) => sum + item.calculated, 0),
    newExpenses: september18.filter((item) => item.type === "EXPENSE").reduce((sum, item) => sum - item.amount, 0),
    eastWest: { available, outstanding: eastWestCard.creditLimit - available, newCharges },
  };
}
