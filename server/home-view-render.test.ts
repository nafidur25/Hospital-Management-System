import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ role: "receptionist" as "admin" | "doctor" | "receptionist" }));

vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({ loading: false, isAuthenticated: true, logout: vi.fn(), user: { id: 7, name: "Restricted User", role: state.role } }),
}));
vi.mock("@/components/DashboardLayout", () => ({ default: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children) }));
vi.mock("@/components/BookingCalendar", () => ({ BookingCalendar: () => null }));
vi.mock("@/components/MedicalRecords", () => ({ MedicalRecords: () => null }));
vi.mock("@/components/StaffAccess", () => ({ StaffAccess: () => null }));
vi.mock("@/lib/trpc", () => {
  const mutation = { useMutation: () => ({ mutate: vi.fn(), isPending: false }) };
  return {
    trpc: {
      useUtils: () => ({ hms: { overview: { invalidate: vi.fn() }, billingDesk: { invalidate: vi.fn() }, getMedicalRecord: { invalidate: vi.fn() }, listStaff: { invalidate: vi.fn() } } }),
      hms: {
        overview: { useQuery: () => ({ data: { clinicians: [], patients: [], appointments: [] }, isLoading: false }) },
        roleContext: { useQuery: () => ({ data: { role: state.role }, isLoading: false, isSuccess: true }) },
        billingDesk: { useQuery: () => ({ data: undefined }) },
        createPatient: mutation,
        recordPayment: mutation,
        updateAppointmentStatus: mutation,
      },
    },
  };
});

import Home from "../client/src/pages/Home";

function renderDirectView(view: string) {
  Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { search: `?view=${encodeURIComponent(view)}` }, setTimeout: () => 0 } });
  return renderToStaticMarkup(React.createElement(Home));
}

afterEach(() => { Reflect.deleteProperty(globalThis, "window"); });

describe("rendered direct HMS view guards", () => {
  it("renders an access-denied screen for receptionist Clinical and Reports URLs", () => {
    state.role = "receptionist";
    expect(renderDirectView("Clinical")).toContain("Clinical is not available to your role.");
    expect(renderDirectView("Reports")).toContain("Reports is not available to your role.");
  });

  it("renders an access-denied screen for doctor Billing and Reports URLs", () => {
    state.role = "doctor";
    expect(renderDirectView("Billing")).toContain("Billing is not available to your role.");
    expect(renderDirectView("Reports")).toContain("Reports is not available to your role.");
  });
});
