import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({ loading: false, user: null }),
}));

vi.mock("@/const", () => ({ startLogin: vi.fn() }));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ cancelQueries: vi.fn(), removeQueries: vi.fn() }),
}));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ auth: { me: { invalidate: vi.fn() } } }),
    auth: { demoLogin: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null }) } },
  },
}));

import DashboardLayout from "../client/src/components/DashboardLayout";

describe("signed-out HMS entry", () => {
  it("renders a secure sign-in gate instead of protected workspace content", () => {
    const markup = renderToStaticMarkup(createElement(DashboardLayout, null, createElement("div", null, "Protected HMS content")));
    expect(markup).toContain("Sign in with credentials");
    expect(markup).toContain("Work email");
    expect(markup).toContain("Password");
    expect(markup).toContain("Demo access accounts");
    expect(markup).toContain("admin@clinicalledger.demo");
    expect(markup).toContain("doctor@clinicalledger.demo");
    expect(markup).toContain("reception@clinicalledger.demo");
    expect(markup).toContain("Protected clinical workspace");
    expect(markup).not.toContain("Protected HMS content");
  });
});
