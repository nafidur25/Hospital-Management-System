import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { hasHmsPermission, type HmsPermission, type HmsRole } from "../shared/hmsAccess";
import { getSessionCookieOptions } from "./_core/cookies";
import { sdk } from "./_core/sdk";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import * as db from "./db";

const gender = z.enum(["Female", "Male", "Other", "Not specified"]);
const appointmentStatus = z.enum(["Scheduled", "Checked in", "Completed", "Cancelled"]);
const paymentMethod = z.enum(["Cash", "Card", "Mobile banking", "Insurance"]);
const hmsRole = z.enum(["admin", "doctor", "receptionist"]);
const priority = z.enum(["Routine", "Urgent"]);
const prescriptionItem = z.object({ medicineName: z.string().min(2).max(160), dosage: z.string().min(1).max(120), route: z.string().min(1).max(80).default("Oral"), frequency: z.string().min(1).max(120), durationDays: z.number().int().positive().max(365).optional(), instructions: z.string().max(1200).optional() });
const operationalPatient = z.object({ patientId: z.number().int().positive(), fullName: z.string().min(2).max(140), gender, phone: z.string().min(6).max(32), careContext: z.string().min(2).max(240) });
const appointmentDisplayName = z.string().trim().max(140).optional();
const operationalAppointment = z.object({ appointmentId: z.number().int().positive(), patientId: z.number().int().positive(), clinicianId: z.number().int().positive(), startsAtMs: z.number().int(), displayName: appointmentDisplayName, reason: z.string().min(2).max(240) });
const managedAccount = z.object({ name: z.string().min(2).max(140), email: z.string().email().max(320), role: hmsRole, clinicianId: z.number().int().positive().optional() });

function assertPermission(role: string, permission: HmsPermission) {
  if (!hasHmsPermission(role, permission)) throw new TRPCError({ code: "FORBIDDEN", message: `Your ${role} role cannot perform this action.` });
}

function roleProcedure(permission: HmsPermission) {
  return protectedProcedure.use(({ ctx, next }) => {
    assertPermission(ctx.user.role, permission);
    return next({ ctx });
  });
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(({ ctx }) => {
      if (!ctx.user) return null;
      return {
        id: ctx.user.id,
        name: ctx.user.name,
        email: ctx.user.email,
        role: ctx.user.role,
        isActive: ctx.user.isActive,
        loginMethod: ctx.user.loginMethod,
        lastSignedIn: ctx.user.lastSignedIn,
      };
    }),
    demoLogin: publicProcedure.input(z.object({ email: z.string().email().max(320), password: z.string().min(8).max(160) })).mutation(async ({ input, ctx }) => {
      const user = await db.authenticateDemoCredentials(input.email, input.password);
      if (!user) throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid email or password." });
      const token = await sdk.createSessionToken(user.openId, { name: user.name || "Clinical Ledger user" });
      ctx.res.cookie(COOKIE_NAME, token, { ...getSessionCookieOptions(ctx.req), maxAge: ONE_YEAR_MS });
      return { id: user.id, name: user.name, email: user.email, role: user.role, token };
    }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  hms: router({
    roleContext: protectedProcedure.query(({ ctx }) => db.getRoleContext(ctx.user.id)),
    overview: roleProcedure("overview").query(() => db.getHmsOverview()),
    billingDesk: roleProcedure("billingRead").query(() => db.getBillingDesk()),
    availability: roleProcedure("appointmentRead").input(z.object({ clinicianId: z.number().int().positive(), dayMs: z.number().int() })).query(({ input }) => db.getAvailability(input.clinicianId, input.dayMs)),
    createPatient: roleProcedure("patientCreate").input(z.object({ fullName: z.string().min(2).max(140), gender, phone: z.string().min(6).max(32), careContext: z.string().min(2).max(240) })).mutation(({ input }) => db.createPatient(input)),
    updatePatient: roleProcedure("patientEdit").input(operationalPatient).mutation(({ input }) => db.updatePatient(input)),
    archivePatient: roleProcedure("patientArchive").input(z.object({ patientId: z.number().int().positive() })).mutation(({ input, ctx }) => db.archivePatient({ patientId: input.patientId, userId: ctx.user.id })),
    bookAppointment: roleProcedure("appointmentBook").input(z.object({ patientId: z.number().int().positive(), clinicianId: z.number().int().positive(), startsAtMs: z.number().int(), displayName: appointmentDisplayName, reason: z.string().min(2).max(240) })).mutation(({ input, ctx }) => db.bookAppointment({ ...input, createdByUserId: ctx.user.id })),
    updateAppointment: roleProcedure("appointmentEdit").input(operationalAppointment).mutation(({ input }) => db.updateAppointment(input)),
    archiveAppointment: roleProcedure("appointmentArchive").input(z.object({ appointmentId: z.number().int().positive() })).mutation(({ input, ctx }) => db.archiveAppointment({ appointmentId: input.appointmentId, userId: ctx.user.id })),
    archivedRecords: roleProcedure("archiveRead").query(() => db.getArchivedRecords()),
    restorePatient: roleProcedure("patientArchive").input(z.object({ patientId: z.number().int().positive() })).mutation(({ input }) => db.restorePatient(input.patientId)),
    restoreAppointment: roleProcedure("appointmentArchive").input(z.object({ appointmentId: z.number().int().positive() })).mutation(({ input }) => db.restoreAppointment(input.appointmentId)),
    updateAppointmentStatus: protectedProcedure.input(z.object({ appointmentId: z.number().int().positive(), status: appointmentStatus })).mutation(({ input, ctx }) => {
      if (input.status === "Checked in") assertPermission(ctx.user.role, "appointmentCheckIn");
      else if (input.status === "Completed") assertPermission(ctx.user.role, "appointmentComplete");
      else assertPermission(ctx.user.role, "appointmentBook");
      return db.updateAppointmentStatus(input.appointmentId, input.status);
    }),
    recordPayment: roleProcedure("paymentRecord").input(z.object({ billId: z.number().int().positive(), amount: z.number().positive(), method: paymentMethod })).mutation(({ input, ctx }) => db.recordPayment({ ...input, userId: ctx.user.id })),
    getMedicalRecord: roleProcedure("medicalRecordRead").input(z.object({ patientId: z.number().int().positive() })).query(({ input }) => db.getPatientMedicalRecord(input.patientId)),
    createClinicalNote: roleProcedure("clinicalNoteWrite").input(z.object({ patientId: z.number().int().positive(), appointmentId: z.number().int().positive().optional(), clinicianId: z.number().int().positive().optional(), subjective: z.string().min(3).max(6000), assessment: z.string().min(3).max(6000), plan: z.string().min(3).max(6000) })).mutation(({ input, ctx }) => db.createClinicalNote({ ...input, userId: ctx.user.id, role: ctx.user.role as HmsRole })),
    createPrescription: roleProcedure("prescriptionWrite").input(z.object({ patientId: z.number().int().positive(), appointmentId: z.number().int().positive().optional(), clinicianId: z.number().int().positive().optional(), notes: z.string().max(3000).optional(), items: z.array(prescriptionItem).min(1).max(12) })).mutation(({ input, ctx }) => db.createPrescription({ ...input, userId: ctx.user.id, role: ctx.user.role as HmsRole })),
    createLaboratoryOrder: roleProcedure("laboratoryOrderWrite").input(z.object({ patientId: z.number().int().positive(), appointmentId: z.number().int().positive().optional(), clinicianId: z.number().int().positive().optional(), testName: z.string().min(2).max(180), priority, clinicalQuestion: z.string().max(3000).optional() })).mutation(({ input, ctx }) => db.createLaboratoryOrder({ ...input, userId: ctx.user.id, role: ctx.user.role as HmsRole })),
    recordLaboratoryResult: roleProcedure("laboratoryResultWrite").input(z.object({ laboratoryOrderId: z.number().int().positive(), clinicianId: z.number().int().positive().optional(), resultSummary: z.string().min(3).max(6000), resultValue: z.string().max(160).optional(), referenceRange: z.string().max(160).optional() })).mutation(({ input, ctx }) => db.recordLaboratoryResult({ ...input, userId: ctx.user.id, role: ctx.user.role as HmsRole })),
    listStaff: roleProcedure("userRoleManage").query(() => db.listStaff()),
    updateStaffRole: roleProcedure("userRoleManage").input(z.object({ userId: z.number().int().positive(), role: hmsRole, clinicianId: z.number().int().positive().optional() })).mutation(({ input }) => db.updateStaffRole(input)),
    listManagedAccounts: roleProcedure("userCredentialManage").query(() => db.listManagedAccounts()),
    createManagedAccount: roleProcedure("userCredentialManage").input(managedAccount.extend({ password: z.string().min(12).max(160) })).mutation(({ input }) => {
      if (input.clinicianId && input.role !== "doctor") throw new TRPCError({ code: "BAD_REQUEST", message: "Only Doctor accounts can be linked to a clinician profile." });
      return db.createManagedAccount(input);
    }),
    updateManagedAccount: roleProcedure("userCredentialManage").input(managedAccount.extend({ userId: z.number().int().positive(), clinicianId: z.number().int().positive().nullable().optional() })).mutation(({ input, ctx }) => {
      if (input.userId === ctx.user.id && input.role !== ctx.user.role) throw new TRPCError({ code: "FORBIDDEN", message: "Administrators cannot change their own role." });
      if (input.clinicianId && input.role !== "doctor") throw new TRPCError({ code: "BAD_REQUEST", message: "Only Doctor accounts can be linked to a clinician profile." });
      return db.updateManagedAccount(input);
    }),
    resetManagedAccountPassword: roleProcedure("userCredentialManage").input(z.object({ userId: z.number().int().positive(), password: z.string().min(12).max(160) })).mutation(({ input }) => db.resetManagedAccountPassword(input.userId, input.password)),
    setManagedAccountActive: roleProcedure("userCredentialManage").input(z.object({ userId: z.number().int().positive(), isActive: z.enum(["yes", "no"]) })).mutation(({ input, ctx }) => {
      if (input.userId === ctx.user.id && input.isActive === "no") throw new TRPCError({ code: "FORBIDDEN", message: "Administrators cannot deactivate their own account." });
      return db.setManagedAccountActive(input.userId, input.isActive);
    }),
  }),
});

export type AppRouter = typeof appRouter;
