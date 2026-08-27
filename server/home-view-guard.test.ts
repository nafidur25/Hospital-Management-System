import { describe, expect, it } from "vitest";
import { shouldRenderAccessDenied } from "../client/src/pages/Home";

describe("HMS Home direct-view guard", () => {
  it("renders the access-denied branch for direct restricted workspace views", () => {
    expect(shouldRenderAccessDenied("receptionist", "Clinical")).toBe(true);
    expect(shouldRenderAccessDenied("receptionist", "Reports")).toBe(true);
    expect(shouldRenderAccessDenied("doctor", "Billing")).toBe(true);
    expect(shouldRenderAccessDenied("doctor", "Reports")).toBe(true);
  });

  it("allows valid direct workspace views", () => {
    expect(shouldRenderAccessDenied("doctor", "Clinical")).toBe(false);
    expect(shouldRenderAccessDenied("receptionist", "Billing")).toBe(false);
    expect(shouldRenderAccessDenied("admin", "Reports")).toBe(false);
  });
});
