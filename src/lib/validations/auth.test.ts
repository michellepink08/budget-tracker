import { describe, expect, it } from "vitest";
import { loginSchema, signupSchema } from "@/lib/validations/auth";

describe("signupSchema", () => {
  it("accepts a valid email and an 8+ character password", () => {
    const result = signupSchema.safeParse({
      email: "person@example.com",
      password: "password123",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid email", () => {
    const result = signupSchema.safeParse({
      email: "not-an-email",
      password: "password123",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a password shorter than 8 characters", () => {
    const result = signupSchema.safeParse({
      email: "person@example.com",
      password: "short",
    });
    expect(result.success).toBe(false);
  });
});

describe("loginSchema", () => {
  it("accepts a valid email and a non-empty password", () => {
    const result = loginSchema.safeParse({
      email: "person@example.com",
      password: "anything",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an empty password", () => {
    const result = loginSchema.safeParse({
      email: "person@example.com",
      password: "",
    });
    expect(result.success).toBe(false);
  });
});
