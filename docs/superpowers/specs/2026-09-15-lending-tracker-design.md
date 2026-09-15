# Lending Tracker ("Loaned") — Design

## Problem

The 5th of Michelle's original asks, deferred as its own project: track money **and products** she lends
to other people — the reverse of the `Loan` feature (which tracks what *she* owes). A dedicated ledger +
page, plus the "Loaned" tab already reserved (but unbuilt) in the main Add dialog.

## Data model — a new `Lending` model, mirroring `Loan`

```prisma
model Lending {
  id              String    @id @default(cuid())
  userId          String
  borrowerName    String
  kind            String // "CASH" | "ITEM"
  amount          Int?      // minor units — CASH only; what was originally lent
  itemDescription String?   // ITEM only
  itemValue       Int?      // minor units — ITEM only, optional, informational only, never affects any balance
  accountId       String?   // CASH only — which of your accounts the money left
  categoryId      String?
  subcategoryId   String?
  date            DateTime
  returned        Boolean   @default(false) // ITEM only — manually toggled; CASH settles itself via computeLendingOutstanding
  archivedAt      DateTime?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  user        User         @relation(fields: [userId], references: [id])
  account     Account?     @relation(fields: [accountId], references: [id])
  category    Category?    @relation(fields: [categoryId], references: [id])
  subcategory Subcategory? @relation(fields: [subcategoryId], references: [id])
}
```

One record per lending event, either `kind: "CASH"` (amount + accountId set, itemDescription/itemValue
null) or `kind: "ITEM"` (itemDescription set, amount/accountId null — itemValue is optional and purely a
note, e.g. "worth about ₱2,000", that nothing ever computes against).

## Categorization — mirrors the Loan → subcategory pattern exactly

A new `resolveOrCreateLendingSubcategory(prisma, userId, borrowerName)`, identical in shape to
`resolveOrCreateLoanSubcategory`: finds or creates a shared **"Lending"** category (`type: "INCOME"` — a
repayment is income when it lands, and this is the type that governs a brand-new category's Budget
treatment), then finds or creates a subcategory under it per borrower name (case-insensitive exact match).

**Why not reuse the existing "Receivables" subcategory** (already in Michelle's Income category, from her
spreadsheet)? Because the derived-outstanding-balance math (below) needs every repayment to share the
*exact same* `subcategoryId` as its own lending record, to sum correctly per borrower — a single shared
"Receivables" bucket can't distinguish "Bob paid ₱200" from "Ana paid ₱200" against their separate
balances. "Receivables" stays exactly as it is today, untouched, for anything else Michelle wants to
categorize that way by hand.

## Recording a CASH lend — a new transaction type

A new `TRANSACTION_TYPES` entry, `"LENDING"` — an outflow, exactly like `LOAN_PAYMENT` is for paying down a
loan. Creating a `Lending` record of `kind: "CASH"` creates one real transaction (type `LENDING`, negative
amount, on the chosen account, categorized to that borrower's own subcategory) — the account's balance
actually drops right away, same as confirmed.

## Recording a repayment — a normal Income transaction, categorized to the same subcategory

No new mechanism needed: adding a regular `INCOME` transaction, categorized (via the existing free-text
category field, or the edit dialog's category+subcategory pickers) to that same borrower's Lending
subcategory, is a repayment. This is the exact same "however it's entered, it's still tracked" property the
Loan feature has — a repayment doesn't require a dedicated button, though the Lending page also gets its
own quick "Record repayment" action for convenience (mirroring the Loans page's "Make a payment").

## Outstanding balance — derived, never mutated (same principle as `computeLoanRemainingBalance`)

```
computeLendingOutstanding(lending):
  if lending.kind !== "CASH": return null   // ITEMs use `returned` instead, see below
  totalRepaid = sum of every transaction with subcategoryId == lending.subcategoryId
                where amount > 0  (INCOME-direction only — the original LENDING outflow
                itself must be excluded, or it would cancel out its own opening amount)
  return max(0, lending.amount - totalRepaid)
```

Concretely: `computeCategoryActual`-style summation, but only summing the *positive* transactions for that
subcategory (repayments), since the original outgoing `LENDING` transaction is already what `lending.amount`
represents — summing it in again would double-count. This is the one place this derivation differs in
shape from `computeLoanRemainingBalance` (which sums everything, because a loan payment is always negative
relative to its own opening balance and there's no separate "opening transaction" to exclude).

## ITEM lends — no transaction, no derived balance, a plain toggle

Since nothing moves through an account, there's no transaction to derive anything from. A `returned`
boolean, flipped by a button on the Lending page ("Mark as returned"), is the entire lifecycle. `itemValue`
is optional and purely descriptive.

## Where it lives

- **New page, `/lending`**, in the sidebar (near Loans & Cards) — lists everyone with an open lend (CASH,
  showing outstanding balance; ITEM, showing description and returned/not), each with an "Edit," a
  "Record repayment" (CASH) or "Mark as returned" (ITEM) action, and an "Archive" once settled.
- **"Loaned" tab**, now actually built in the main Add dialog's `TransactionForm`, alongside
  Transaction/Transfer/Borrowed — the fields swap to: borrower name, kind (Cash/Item toggle), then either
  amount + paying account (Cash) or item description + optional value (Item).

## Out of scope (this spec)

- Any reminder/notification for overdue lends.
- Splitting a single CASH lend into partial repayments schedule (repayments are free-form, whenever/however
  much, same as loan payments already are).
- Migrating anything about the existing "Receivables" subcategory.
