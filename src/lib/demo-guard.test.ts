import { describe, expect, it, vi } from "vitest";
import { assertNotDemo, assertUnderDemoCap } from "@/lib/demo-guard";
import { DEMO_EMAIL } from "@/lib/config";

describe("assertNotDemo", () => {
  it("blocks the demo account", async () => {
    const prisma = { user: { findUnique: vi.fn().mockResolvedValue({ email: DEMO_EMAIL }) } } as any;
    const result = await assertNotDemo(prisma, "demo-user-id");
    expect(result).toEqual({
      ok: false,
      error: "Not available in the shared demo — sign up for your own account to do this.",
    });
  });

  it("allows a real account", async () => {
    const prisma = { user: { findUnique: vi.fn().mockResolvedValue({ email: "real.user@example.com" }) } } as any;
    const result = await assertNotDemo(prisma, "real-user-id");
    expect(result).toBeNull();
  });

  it("allows when the user row can't be found (fail open — a missing user is caught elsewhere)", async () => {
    const prisma = { user: { findUnique: vi.fn().mockResolvedValue(null) } } as any;
    const result = await assertNotDemo(prisma, "missing-user-id");
    expect(result).toBeNull();
  });
});

describe("assertUnderDemoCap", () => {
  it("blocks the demo account once it's at the cap", async () => {
    const prisma = { user: { findUnique: vi.fn().mockResolvedValue({ email: DEMO_EMAIL }) } } as any;
    const countCurrent = vi.fn().mockResolvedValue(100);
    const result = await assertUnderDemoCap(prisma, "demo-user-id", countCurrent, 100);
    expect(result).toEqual({ ok: false, error: "Demo limit reached (100 max) — sign up to add more." });
  });

  it("allows the demo account one under the cap", async () => {
    const prisma = { user: { findUnique: vi.fn().mockResolvedValue({ email: DEMO_EMAIL }) } } as any;
    const countCurrent = vi.fn().mockResolvedValue(99);
    const result = await assertUnderDemoCap(prisma, "demo-user-id", countCurrent, 100);
    expect(result).toBeNull();
  });

  it("never even calls countCurrent for a real account", async () => {
    const prisma = { user: { findUnique: vi.fn().mockResolvedValue({ email: "real.user@example.com" }) } } as any;
    const countCurrent = vi.fn().mockResolvedValue(9999);
    const result = await assertUnderDemoCap(prisma, "real-user-id", countCurrent, 100);
    expect(result).toBeNull();
    expect(countCurrent).not.toHaveBeenCalled();
  });
});
