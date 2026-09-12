import { describe, expect, it } from "vitest";
import { forgotPasswordSchema, resetPasswordSchema } from "@/lib/validations/password-reset";

describe("forgotPasswordSchema", () => {
  it("accepts a valid email", () => {
    expect(forgotPasswordSchema.safeParse({ email: "demo@example.com" }).success).toBe(true);
  });

  it("rejects an invalid email", () => {
    expect(forgotPasswordSchema.safeParse({ email: "not-an-email" }).success).toBe(false);
  });
});

describe("resetPasswordSchema", () => {
  it("accepts a token and a password of at least 8 characters", () => {
    const result = resetPasswordSchema.safeParse({ token: "abc123", password: "newpassword123" });
    expect(result.success).toBe(true);
  });

  it("rejects a password shorter than 8 characters", () => {
    const result = resetPasswordSchema.safeParse({ token: "abc123", password: "short" });
    expect(result.success).toBe(false);
  });

  it("rejects an empty token", () => {
    const result = resetPasswordSchema.safeParse({ token: "", password: "newpassword123" });
    expect(result.success).toBe(false);
  });
});
