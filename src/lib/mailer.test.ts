import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { sendPasswordResetEmail, type Mailer } from "@/lib/mailer";

const resetUrl = "http://localhost:3000/reset-password?token=abc123";

function makeFakeMailer(sendMailImpl?: () => Promise<unknown>): Mailer {
  return {
    sendMail: vi.fn(sendMailImpl ?? (() => Promise.resolve({}))),
  };
}

describe("sendPasswordResetEmail", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("sends to the given address with a non-empty subject and both html and text bodies", async () => {
    const mailer = makeFakeMailer();

    await sendPasswordResetEmail(mailer, "demo@example.com", resetUrl);

    expect(mailer.sendMail).toHaveBeenCalledTimes(1);
    const message = (mailer.sendMail as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(message.to).toBe("demo@example.com");
    expect(message.subject.length).toBeGreaterThan(0);
    expect(message.html).toContain(resetUrl);
    expect(message.text).toContain(resetUrl);
  });

  it("logs and does not throw when the underlying send fails", async () => {
    const mailer = makeFakeMailer(() => Promise.reject(new Error("SMTP down")));

    await expect(sendPasswordResetEmail(mailer, "demo@example.com", resetUrl)).resolves.toBeUndefined();

    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
  });
});
