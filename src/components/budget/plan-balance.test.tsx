import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PlanBalance } from "@/components/budget/plan-balance";

describe("PlanBalance", () => {
  it("shows only the amount left when spending is below plan", () => {
    const html = renderToStaticMarkup(<PlanBalance planned={100000} actual={70000} currency="PHP" kind="spending" />);
    expect(html).toContain("300.00");
    expect(html).toContain("left");
  });
  it("labels income shortfalls and extra payments clearly", () => {
    expect(renderToStaticMarkup(<PlanBalance planned={10000} actual={7000} currency="PHP" kind="income" />)).toContain("short");
    expect(renderToStaticMarkup(<PlanBalance planned={10000} actual={12000} currency="PHP" kind="payment" />)).toContain("paid extra");
  });
});
