import { describe, expect, it, vi } from "vitest";
import { createUser } from "@/lib/signup";

function makeFakePrisma(existingUser: unknown = null) {
  return {
    user: {
      findUnique: vi.fn().mockResolvedValue(existingUser),
      create: vi.fn().mockResolvedValue({}),
    },
  } as any;
}

describe("createUser", () => {
  it("creates a user when the email is not already taken", async () => {
    const prisma = makeFakePrisma(null);

    const result = await createUser(prisma, "new@example.com", "password123");

    expect(result).toEqual({ ok: true });
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: "new@example.com" },
    });
    expect(prisma.user.create).toHaveBeenCalledTimes(1);
    const createArgs = prisma.user.create.mock.calls[0][0];
    expect(createArgs.data.email).toBe("new@example.com");
    expect(createArgs.data.passwordHash).not.toBe("password123");
  });

  it("rejects when the email is already in use", async () => {
    const prisma = makeFakePrisma({ id: "existing-id", email: "taken@example.com" });

    const result = await createUser(prisma, "taken@example.com", "password123");

    expect(result).toEqual({ ok: false, error: "Email already in use" });
    expect(prisma.user.create).not.toHaveBeenCalled();
  });
});
