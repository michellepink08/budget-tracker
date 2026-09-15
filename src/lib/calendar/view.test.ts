import { describe, expect, it } from "vitest";
import { resolveCalendarView } from "@/lib/calendar/view";

describe("resolveCalendarView", () => {
  it("uses Month when no calendar view is selected", () => {
    expect(resolveCalendarView(undefined)).toBe("month");
  });
});
