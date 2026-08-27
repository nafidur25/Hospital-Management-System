import { describe, expect, it } from "vitest";
import { canAccessHmsPage } from "../shared/hmsAccess";

describe("HMS direct view permissions", () => {
  it("blocks receptionists from clinical, billing, and reports views", () => {
    expect(canAccessHmsPage("receptionist", "Clinical")).toBe(false);
    expect(canAccessHmsPage("receptionist", "Billing")).toBe(true);
    expect(canAccessHmsPage("receptionist", "Reports")).toBe(false);
  });

  it("blocks doctors from billing and management reports while allowing clinical records", () => {
    expect(canAccessHmsPage("doctor", "Clinical")).toBe(true);
    expect(canAccessHmsPage("doctor", "Billing")).toBe(false);
    expect(canAccessHmsPage("doctor", "Reports")).toBe(false);
  });

  it("allows administrators to access every HMS workspace", () => {
    ["Overview", "Patients", "Appointments", "Clinical", "Pharmacy & Lab", "Billing", "Reports"].forEach((page) => {
      expect(canAccessHmsPage("admin", page as Parameters<typeof canAccessHmsPage>[1])).toBe(true);
    });
  });
});
