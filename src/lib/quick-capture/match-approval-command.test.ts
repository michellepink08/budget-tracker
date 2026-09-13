import { describe, expect, it } from "vitest";
import { matchApprovalCommand } from "@/lib/quick-capture/match-approval-command";

describe("matchApprovalCommand", () => {
  it.each(["confirm", "Confirm", "yes", "yeah", "ok", "okay"])("matches \"%s\" as confirm", (word) => {
    expect(matchApprovalCommand(word)).toBe("confirm");
  });

  it.each(["cancel", "no", "nope"])("matches \"%s\" as cancel", (word) => {
    expect(matchApprovalCommand(word)).toBe("cancel");
  });

  it("matches undo", () => {
    expect(matchApprovalCommand("undo")).toBe("undo");
  });

  it("matches only the first word of a longer phrase", () => {
    expect(matchApprovalCommand("confirm that please")).toBe("confirm");
  });

  it("returns null for text that isn't a command", () => {
    expect(matchApprovalCommand("paid 180 for food")).toBeNull();
  });

  it("returns null for empty or whitespace-only text", () => {
    expect(matchApprovalCommand("   ")).toBeNull();
    expect(matchApprovalCommand("")).toBeNull();
  });
});
