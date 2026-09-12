import { describe, expect, it } from "vitest";
import { parseRelativeOrExplicitDate } from "@/lib/quick-capture/parse-date";

const now = new Date(2026, 8, 13); // Sunday, September 13, 2026 (matches this project's "today")

describe("parseRelativeOrExplicitDate", () => {
  it("resolves 'today'", () => {
    const result = parseRelativeOrExplicitDate("Paid 180 for food today", now);
    expect(result.value).toEqual(new Date(2026, 8, 13));
    expect(result.confirmed).toBe(true);
  });

  it("resolves 'yesterday'", () => {
    const result = parseRelativeOrExplicitDate("Bought fruits for 300 cash yesterday", now);
    expect(result.value).toEqual(new Date(2026, 8, 12));
    expect(result.confirmed).toBe(true);
  });

  it("resolves 'last Saturday' to the most recent past Saturday", () => {
    const result = parseRelativeOrExplicitDate("paid 100 cash last saturday", now);
    // now is Sunday Sep 13 2026 — the most recent Saturday before it is Sep 12
    expect(result.value).toEqual(new Date(2026, 8, 12));
    expect(result.confirmed).toBe(true);
  });

  it("resolves an explicit month-and-day in the past this year", () => {
    const result = parseRelativeOrExplicitDate("Mama borrowed 500 from my BPI Savings last August 27", now);
    expect(result.value).toEqual(new Date(2026, 7, 27));
    expect(result.confirmed).toBe(true);
  });

  it("(past direction, default) rolls a future-seeming month-day back to last year — correct for a transaction date, which is never in the future", () => {
    const result = parseRelativeOrExplicitDate("paid 100 cash October 5", now);
    expect(result.value).toEqual(new Date(2025, 9, 5));
    expect(result.confirmed).toBe(true);
  });

  it("(future direction) keeps a not-yet-passed month-day in the current year — correct for a due date", () => {
    const result = parseRelativeOrExplicitDate("BPI credit card is 25389.83 due December 5", now, "future");
    expect(result.value).toEqual(new Date(2026, 11, 5));
    expect(result.confirmed).toBe(true);
  });

  it("(future direction) rolls an already-passed month-day forward to next year — correct for a due date", () => {
    const result = parseRelativeOrExplicitDate("due January 5", now, "future");
    expect(result.value).toEqual(new Date(2027, 0, 5));
    expect(result.confirmed).toBe(true);
  });

  it("marks an approximated date as unconfirmed", () => {
    const result = parseRelativeOrExplicitDate("due around October 5", now, "future");
    expect(result.value).toEqual(new Date(2026, 9, 5));
    expect(result.confirmed).toBe(false);
  });

  it("defaults to today, unconfirmed, when no date phrase is present", () => {
    const result = parseRelativeOrExplicitDate("Paid 180 for food using cash", now);
    expect(result.value).toEqual(new Date(2026, 8, 13));
    expect(result.confirmed).toBe(false);
  });
});
