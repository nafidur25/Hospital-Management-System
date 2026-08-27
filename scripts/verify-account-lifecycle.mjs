import { eq } from "drizzle-orm";
import {
  authenticateDemoCredentials,
  createManagedAccount,
  getDb,
  getHmsOverview,
  resetManagedAccountPassword,
  setManagedAccountActive,
  updateAppointment,
  updatePatient,
} from "../server/db.ts";
import { users } from "../drizzle/schema.ts";

const email = `lifecycle.${Date.now()}@clinicalledger.demo`;
const initialPassword = "LifecycleCredential!2026";
const replacementPassword = "ResetLifecycle!2026";
let accountId;
let patient;
let appointment;

try {
  const account = await createManagedAccount({ name: "Lifecycle Verification", email, password: initialPassword, role: "receptionist" });
  accountId = account.id;
  const authenticated = await authenticateDemoCredentials(email, initialPassword);
  if (!authenticated || authenticated.role !== "receptionist") throw new Error("New credential account did not authenticate as Receptionist.");
  await setManagedAccountActive(accountId, "no");
  if (await authenticateDemoCredentials(email, initialPassword)) throw new Error("Deactivated account was allowed to authenticate.");
  await setManagedAccountActive(accountId, "yes");
  await resetManagedAccountPassword(accountId, replacementPassword);
  if (await authenticateDemoCredentials(email, initialPassword)) throw new Error("Superseded password was accepted.");
  if (!await authenticateDemoCredentials(email, replacementPassword)) throw new Error("Reset password was not accepted.");

  const overview = await getHmsOverview();
  patient = overview.patients[0];
  appointment = overview.appointments[0];
  if (!patient || !appointment) throw new Error("Operational verification data is unavailable.");
  const originalContext = patient.careContext;
  const originalReason = appointment.appointment.reason;
  await updatePatient({ patientId: patient.id, fullName: patient.fullName, gender: patient.gender, phone: patient.phone, careContext: `${originalContext} · lifecycle verified` });
  const updatedOverview = await getHmsOverview();
  const updatedPatient = updatedOverview.patients.find((entry) => entry.id === patient.id);
  if (!updatedPatient?.careContext.includes("lifecycle verified")) throw new Error("Patient edit did not persist.");
  await updatePatient({ patientId: patient.id, fullName: patient.fullName, gender: patient.gender, phone: patient.phone, careContext: originalContext });
  await updateAppointment({ appointmentId: appointment.appointment.id, patientId: appointment.patient.id, clinicianId: appointment.clinician.id, startsAtMs: appointment.appointment.startsAt.getTime(), reason: `${originalReason} · lifecycle verified` });
  const appointmentOverview = await getHmsOverview();
  const updatedAppointment = appointmentOverview.appointments.find((entry) => entry.appointment.id === appointment.appointment.id);
  if (!updatedAppointment?.appointment.reason.includes("lifecycle verified")) throw new Error("Appointment edit did not persist.");
  await updateAppointment({ appointmentId: appointment.appointment.id, patientId: appointment.patient.id, clinicianId: appointment.clinician.id, startsAtMs: appointment.appointment.startsAt.getTime(), reason: originalReason });
  console.log("Account lifecycle and operational edit verification passed.");
} finally {
  const db = await getDb();
  if (db) await db.delete(users).where(eq(users.email, email));
}

process.exit(0);
