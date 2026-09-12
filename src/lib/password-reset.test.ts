import { describe, expect, it, vi } from "vitest";
import crypto from "crypto";
import { requestPasswordReset, resetPassword } from "@/lib/password-reset";

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function makeFakePrisma(options: { user?: unknown; tokenRecord?: unknown } = {}) {
  const user = "user" in options ? options.user : { id: "user-1", email: "demo@example.com" };
  const tokenRecord = options.tokenRecord;
  return {
    user: {
      findUnique: vi.fn().mockResolvedValue(user),
      update: vi.fn().mockResolvedValue({}),
    },
    passwordResetToken: {
      create: vi.fn().mockResolvedValue({ id: "token-row-1" }),
      findUnique: vi.fn().mockResolvedValue(tokenRecord),
      update: vi.fn().mockResolvedValue({}),
    },
  } as any;
}

describe("requestPasswordReset", () => {
  it("creates a hashed, expiring token row for an existing user and returns the plaintext token", async () => {
    const prisma = makeFakePrisma();

    const result = await requestPasswordReset(prisma, "demo@example.com");

    expect(result).not.toBeNull();
    expect(result!.token).toEqual(expect.any(String));
    expect(result!.token.length).toBeGreaterThan(20);

    const createArgs = prisma.passwordResetToken.create.mock.calls[0][0].data;
    expect(createArgs.userId).toBe("user-1");
    expect(createArgs.tokenHash).toBe(hashToken(result!.token));
    expect(createArgs.expiresAt).toBeInstanceOf(Date);
    expect(createArgs.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("returns null for an email that isn't registered, without creating a token", async () => {
    const prisma = makeFakePrisma({ user: null });

    const result = await requestPasswordReset(prisma, "nobody@example.com");

    expect(result).toBeNull();
    expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
  });
});

describe("resetPassword", () => {
  it("updates the password and marks the token used, for a valid unused unexpired token", async () => {
    const token = "a".repeat(64);
    const prisma = makeFakePrisma({
      tokenRecord: {
        id: "token-row-1",
        userId: "user-1",
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        usedAt: null,
      },
    });

    const result = await resetPassword(prisma, token, "newpassword123");

    expect(result).toEqual({ ok: true });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { passwordHash: expect.any(String) },
    });
    expect(prisma.passwordResetToken.update).toHaveBeenCalledWith({
      where: { id: "token-row-1" },
      data: { usedAt: expect.any(Date) },
    });
  });

  it("rejects an unknown token", async () => {
    const prisma = makeFakePrisma({ tokenRecord: null });

    const result = await resetPassword(prisma, "not-a-real-token", "newpassword123");

    expect(result).toEqual({ ok: false, error: "This reset link is invalid or has expired" });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("rejects an already-used token", async () => {
    const token = "b".repeat(64);
    const prisma = makeFakePrisma({
      tokenRecord: {
        id: "token-row-1",
        userId: "user-1",
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        usedAt: new Date(),
      },
    });

    const result = await resetPassword(prisma, token, "newpassword123");

    expect(result).toEqual({ ok: false, error: "This reset link is invalid or has expired" });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("rejects an expired token", async () => {
    const token = "c".repeat(64);
    const prisma = makeFakePrisma({
      tokenRecord: {
        id: "token-row-1",
        userId: "user-1",
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() - 1000),
        usedAt: null,
      },
    });

    const result = await resetPassword(prisma, token, "newpassword123");

    expect(result).toEqual({ ok: false, error: "This reset link is invalid or has expired" });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});
