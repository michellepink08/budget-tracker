import { describe, expect, it } from "vitest";
import { passwordResetEmailHtml, passwordResetEmailText } from "@/lib/email-templates/password-reset";

const resetUrl = "http://localhost:3000/reset-password?token=abc123";

describe("passwordResetEmailHtml", () => {
  it("embeds the reset URL inside an anchor tag", () => {
    const html = passwordResetEmailHtml(resetUrl);
    expect(html).toContain(`href="${resetUrl}"`);
  });

  it("is a full HTML document", () => {
    const html = passwordResetEmailHtml(resetUrl);
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("</html>");
  });
});

describe("passwordResetEmailText", () => {
  it("embeds the reset URL as plain text", () => {
    const text = passwordResetEmailText(resetUrl);
    expect(text).toContain(resetUrl);
  });

  it("does not contain any HTML tags", () => {
    const text = passwordResetEmailText(resetUrl);
    expect(text).not.toContain("<");
  });
});
