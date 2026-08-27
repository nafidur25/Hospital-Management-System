import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";
import type { HmsRole } from "../shared/hmsAccess";

vi.mock("./db", () => ({
  createPatient: vi.fn(async (input) => ({ id: 101, patientCode: "P-9001", ...input })),
  bookAppointment: vi.fn(async (input) => ({ id: 201, appointmentCode: "A-9001", ...input })),
  recordPayment: vi.fn(async () => ({ success: true })),
  getHmsOverview: vi.fn(async () => ({ clinicians: [], patients: [], appointments: [] })),
  getBillingDesk: vi.fn(async () => ({ bills: [], paymentTotals: {}, financialSummary: { totalBilled: 0, totalCollected: 0, outstanding: 0 } })),
  getAvailability: vi.fn(async () => []),
  getRoleContext: vi.fn(async () => ({ role: "admin", clinician: null })),
  getPatientMedicalRecord: vi.fn(async () => ({})),
  createClinicalNote: vi.fn(async () => ({ success: true })),
  createPrescription: vi.fn(async () => ({ success: true })),
  createLaboratoryOrder: vi.fn(async () => ({ success: true })),
  recordLaboratoryResult: vi.fn(async () => ({ success: true })),
  listStaff: vi.fn(async () => []),
  updateStaffRole: vi.fn(async () => ({ success: true })),
  listManagedAccounts: vi.fn(async () => []),
  createManagedAccount: vi.fn(async (input) => ({ id: 301, ...input })),
  updateManagedAccount: vi.fn(async () => ({ success: true })),
  resetManagedAccountPassword: vi.fn(async () => ({ success: true })),
  setManagedAccountActive: vi.fn(async () => ({ success: true })),
  updatePatient: vi.fn(async (input) => input),
  updateAppointment: vi.fn(async (input) => input),
  archivePatient: vi.fn(async () => ({ success: true })),
  archiveAppointment: vi.fn(async () => ({ success: true })),
  getArchivedRecords: vi.fn(async () => ({ patients: [], appointments: [] })),
  restorePatient: vi.fn(async () => ({ success: true })),
  restoreAppointment: vi.fn(async () => ({ success: true })),
  updateAppointmentStatus: vi.fn(async () => ({ success: true })),
}));

import { appRouter } from "./routers";
import * as db from "./db";

function authenticatedContext(role: HmsRole): TrpcContext {
  return {
    user: { id: 77, openId: `clinical-${role}`, email: "user@clinical.test", name: "Clinical User", loginMethod: "manus", role, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("HMS role-protected mutations", () => {
  beforeEach(() => vi.clearAllMocks());

  it("allows a receptionist to register patients, book visits, and record payments", async () => {
    const caller = appRouter.createCaller(authenticatedContext("receptionist"));
    await caller.hms.createPatient({ fullName: "Farhan Siddique", gender: "Male", phone: "+8801712345678", careContext: "Initial assessment" });
    await caller.hms.bookAppointment({ patientId: 4, clinicianId: 2, startsAtMs: 1_785_000_000_000, displayName: "Annual review", reason: "Follow-up consultation" });
    await caller.hms.recordPayment({ billId: 9, amount: 450, method: "Card" });
    expect(db.createPatient).toHaveBeenCalledTimes(1);
    expect(db.bookAppointment).toHaveBeenCalledWith({ patientId: 4, clinicianId: 2, startsAtMs: 1_785_000_000_000, displayName: "Annual review", reason: "Follow-up consultation", createdByUserId: 77 });
    expect(db.recordPayment).toHaveBeenCalledWith({ billId: 9, amount: 450, method: "Card", userId: 77 });
  });

  it("allows Administrators and Receptionists to edit operational patient and appointment records", async () => {
    const patient = { patientId: 4, fullName: "Farhan Siddique", gender: "Male" as const, phone: "+8801712345678", careContext: "Updated registration" };
    const appointment = { appointmentId: 9, patientId: 4, clinicianId: 2, startsAtMs: 1_785_000_000_000, displayName: "Follow-up ECG", reason: "Rescheduled follow-up" };
    for (const role of ["admin", "receptionist"] as const) {
      const caller = appRouter.createCaller(authenticatedContext(role));
      await caller.hms.updatePatient(patient);
      await caller.hms.updateAppointment(appointment);
    }
    expect(db.updatePatient).toHaveBeenCalledWith(patient);
    expect(db.updateAppointment).toHaveBeenCalledWith(appointment);
    const doctor = appRouter.createCaller(authenticatedContext("doctor"));
    await expect(doctor.hms.updatePatient(patient)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(doctor.hms.updateAppointment(appointment)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows Administrators and Receptionists to archive and restore eligible operational records but blocks Doctors", async () => {
    for (const role of ["admin", "receptionist"] as const) {
      const caller = appRouter.createCaller(authenticatedContext(role));
      await caller.hms.archivePatient({ patientId: 41 });
      await caller.hms.archiveAppointment({ appointmentId: 71 });
      await caller.hms.restorePatient({ patientId: 41 });
      await caller.hms.restoreAppointment({ appointmentId: 71 });
    }
    expect(db.archivePatient).toHaveBeenCalledWith({ patientId: 41, userId: 77 });
    expect(db.archiveAppointment).toHaveBeenCalledWith({ appointmentId: 71, userId: 77 });
    expect(db.restorePatient).toHaveBeenCalledWith(41);
    expect(db.restoreAppointment).toHaveBeenCalledWith(71);
    const doctor = appRouter.createCaller(authenticatedContext("doctor"));
    await expect(doctor.hms.archivePatient({ patientId: 41 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(doctor.hms.archiveAppointment({ appointmentId: 71 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(doctor.hms.archivedRecords()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("limits credential lifecycle operations to Admins and prevents self-lockout", async () => {
    const admin = appRouter.createCaller(authenticatedContext("admin"));
    await admin.hms.createManagedAccount({ name: "New Reception", email: "new.reception@clinicalledger.demo", password: "NewCredential!2026", role: "receptionist" });
    await admin.hms.updateManagedAccount({ userId: 91, name: "Updated Account", email: "updated@clinicalledger.demo", role: "doctor", clinicianId: 2 });
    await admin.hms.resetManagedAccountPassword({ userId: 91, password: "ResetCredential!2026" });
    await admin.hms.setManagedAccountActive({ userId: 91, isActive: "no" });
    expect(db.createManagedAccount).toHaveBeenCalledTimes(1);
    expect(db.setManagedAccountActive).toHaveBeenCalledWith(91, "no");
    await expect(admin.hms.setManagedAccountActive({ userId: 77, isActive: "no" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(admin.hms.updateManagedAccount({ userId: 77, name: "Clinical User", email: "user@clinical.test", role: "doctor" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    const receptionist = appRouter.createCaller(authenticatedContext("receptionist"));
    await expect(receptionist.hms.listManagedAccounts()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(receptionist.hms.createManagedAccount({ name: "Blocked", email: "blocked@clinicalledger.demo", password: "BlockedCredential!2026", role: "receptionist" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("blocks receptionists from reading clinical records and prescribing", async () => {
    const caller = appRouter.createCaller(authenticatedContext("receptionist"));
    await expect(caller.hms.getMedicalRecord({ patientId: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.hms.createPrescription({ patientId: 1, items: [{ medicineName: "Amlodipine", dosage: "5 mg", frequency: "Once daily" }] })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows doctors to create prescriptions while attaching the authenticated role", async () => {
    const caller = appRouter.createCaller(authenticatedContext("doctor"));
    await caller.hms.createPrescription({ patientId: 1, notes: "Continue treatment.", items: [{ medicineName: "Amlodipine", dosage: "5 mg", frequency: "Once daily" }] });
    expect(db.createPrescription).toHaveBeenCalledWith(expect.objectContaining({ patientId: 1, userId: 77, role: "doctor" }));
  });

  it("blocks doctors from recording payments and administrators from no permitted feature", async () => {
    const doctor = appRouter.createCaller(authenticatedContext("doctor"));
    await expect(doctor.hms.recordPayment({ billId: 9, amount: 450, method: "Card" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    const admin = appRouter.createCaller(authenticatedContext("admin"));
    await admin.hms.updateStaffRole({ userId: 8, role: "doctor", clinicianId: 2 });
    expect(db.updateStaffRole).toHaveBeenCalledWith({ userId: 8, role: "doctor", clinicianId: 2 });
  });

  it("scopes financial overview data and appointment status actions by role", async () => {
    const doctor = appRouter.createCaller(authenticatedContext("doctor"));
    await expect(doctor.hms.overview()).resolves.toEqual({ clinicians: [], patients: [], appointments: [] });
    expect(db.getHmsOverview).toHaveBeenLastCalledWith();
    await expect(doctor.hms.updateAppointmentStatus({ appointmentId: 8, status: "Checked in" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await doctor.hms.updateAppointmentStatus({ appointmentId: 8, status: "Completed" });
    await expect(doctor.hms.updateAppointmentStatus({ appointmentId: 8, status: "Scheduled" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(doctor.hms.updateAppointmentStatus({ appointmentId: 8, status: "Cancelled" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    const receptionist = appRouter.createCaller(authenticatedContext("receptionist"));
    await expect(receptionist.hms.overview()).resolves.toEqual({ clinicians: [], patients: [], appointments: [] });
    await receptionist.hms.updateAppointmentStatus({ appointmentId: 8, status: "Checked in" });
    await expect(receptionist.hms.updateAppointmentStatus({ appointmentId: 8, status: "Completed" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await receptionist.hms.updateAppointmentStatus({ appointmentId: 8, status: "Scheduled" });
    await receptionist.hms.updateAppointmentStatus({ appointmentId: 8, status: "Cancelled" });
    await expect(receptionist.hms.billingDesk()).resolves.toMatchObject({ financialSummary: { totalBilled: 0 } });
    await expect(receptionist.hms.listStaff()).rejects.toMatchObject({ code: "FORBIDDEN" });
    const admin = appRouter.createCaller(authenticatedContext("admin"));
    await expect(admin.hms.overview()).resolves.toEqual({ clinicians: [], patients: [], appointments: [] });
    await admin.hms.updateAppointmentStatus({ appointmentId: 8, status: "Checked in" });
    await admin.hms.updateAppointmentStatus({ appointmentId: 8, status: "Completed" });
    await admin.hms.updateAppointmentStatus({ appointmentId: 8, status: "Scheduled" });
    await admin.hms.updateAppointmentStatus({ appointmentId: 8, status: "Cancelled" });
    await expect(admin.hms.billingDesk()).resolves.toMatchObject({ financialSummary: { totalCollected: 0 } });
    await expect(doctor.hms.billingDesk()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("never exposes password hashes, openIds, or credential secrets in auth.me or account queries", async () => {
    const admin = appRouter.createCaller(authenticatedContext("admin"));
    const me = await admin.auth.me();
    expect(me).toEqual({
      id: 77,
      name: "Clinical User",
      email: "user@clinical.test",
      role: "admin",
      isActive: undefined,
      loginMethod: "manus",
      lastSignedIn: expect.any(Date),
    });
    expect(me).not.toHaveProperty("passwordHash");
    expect(me).not.toHaveProperty("openId");

    const unauthenticated = appRouter.createCaller({ user: null, req: {} as any, res: {} as any });
    expect(await unauthenticated.auth.me()).toBeNull();
  });
});

