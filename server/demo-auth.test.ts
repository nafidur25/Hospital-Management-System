import { describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const mocks = vi.hoisted(() => ({
  authenticateDemoCredentials: vi.fn(async (email: string, password: string) => {
    if (password !== "correct-demo-password") return undefined;
    const role = email.startsWith("admin") ? "admin" : email.startsWith("doctor") ? "doctor" : "receptionist";
    return { id: 21, openId: `demo_${role}`, name: `${role} user`, email, role, loginMethod: "credential-demo", passwordHash: "hash", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() };
  }),
}));

vi.mock("./db", () => ({ authenticateDemoCredentials: mocks.authenticateDemoCredentials }));
vi.mock("./_core/sdk", () => ({ sdk: { createSessionToken: vi.fn(async (openId: string) => `session-${openId}`) } }));

import { appRouter } from "./routers";

function context(): { ctx: TrpcContext; cookies: Array<{ name: string; value: string; options: Record<string, unknown> }> } {
  const cookies: Array<{ name: string; value: string; options: Record<string, unknown> }> = [];
  return {
    ctx: {
      user: null,
      req: { protocol: "https", headers: {} } as TrpcContext["req"],
      res: { cookie: (name: string, value: string, options: Record<string, unknown>) => cookies.push({ name, value, options }) } as TrpcContext["res"],
    },
    cookies,
  };
}

describe("auth.demoLogin", () => {
  it("issues a protected session cookie for each valid role account", async () => {
    for (const [email, expectedRole] of [["admin@clinicalledger.demo", "admin"], ["doctor@clinicalledger.demo", "doctor"], ["reception@clinicalledger.demo", "receptionist"]] as const) {
      const { ctx, cookies } = context();
      const result = await appRouter.createCaller(ctx).auth.demoLogin({ email, password: "correct-demo-password" });
      expect(result.role).toBe(expectedRole);
      expect(cookies[0]).toMatchObject({ name: "app_session_id", value: `session-demo_${expectedRole}` });
      expect(cookies[0]?.options).toMatchObject({ httpOnly: true, secure: true, sameSite: "none", path: "/" });
    }
  });

  it("rejects invalid credential pairs without issuing a session", async () => {
    const { ctx, cookies } = context();
    await expect(appRouter.createCaller(ctx).auth.demoLogin({ email: "doctor@clinicalledger.demo", password: "wrong-password" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(cookies).toHaveLength(0);
  });
});
