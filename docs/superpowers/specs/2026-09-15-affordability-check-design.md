# "Can I Afford This?" — Design

## Problem

The fourth of Michelle's 5 requested features: a quick way to type an amount and get a yes/no answer against
her overall Safe to Spend for the cutoff, right on the Dashboard.

## What it checks

The Dashboard already computes `safeToSpend` (`computeSafeToSpend`) — the whole-cutoff "money not already
spoken for" figure shown as "Safe to spend" under Disposable Accounts. This feature reuses that exact
number; it introduces no new server-side computation.

## Where it lives

A small card on the Dashboard, below the existing summary cards: a single amount input, with the answer
updating live as you type (no submit button, no server round-trip — `safeToSpend` is already known the
moment the Dashboard renders, so the comparison is pure client-side arithmetic). An empty input shows
neither answer, just the input itself.

## The check itself

```
canAfford = amount <= safeToSpend
remainingAfter = safeToSpend - amount
```

- **Can afford:** "Yes — ₱X will still be safe to spend after this." (green/success styling)
- **Can't afford:** "No — this would put you ₱Y over your safe-to-spend." (red/danger styling, `Y = amount - safeToSpend`)

This is a pure arithmetic comparison, easily unit-tested without touching Prisma at all.

## Out of scope (this spec)

- Per-category affordability (checking a specific budget's remaining instead of overall safe-to-spend) —
  explicitly deferred by Michelle's own answer.
- Any natural-language understanding of "this and that" — that's the AI advisor, the 5th and final spec.
- Any server action or database write — this never saves anything, it only answers a question about
  numbers the Dashboard already has.
