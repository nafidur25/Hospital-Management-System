import { eq } from "drizzle-orm";
import {
  archiveAppointment,
  archivePatient,
  bookAppointment,
  createPatient,
  getArchivedRecords,
  getAvailability,
  getDb,
  getHmsOverview,
  restoreAppointment,
  restorePatient,
} from "../server/db.ts";
import { appointments, patients } from "../drizzle/schema.ts";

let patientId;
let appointmentId;

try {
  const overview = await getHmsOverview();
  const protectedAppointment = overview.appointments[0]?.appointment;
  const protectedPatient = overview.patients[0];
  const clinician = overview.clinicians[0];
  if (!protectedAppointment || !protectedPatient || !clinician) throw new Error("Seeded HMS records are unavailable.");

  await archiveAppointment({ appointmentId: protectedAppointment.id, userId: 1 }).then(
    () => { throw new Error("A billed or clinically linked appointment was archived."); },
    () => undefined,
  );
  await archivePatient({ patientId: protectedPatient.id, userId: 1 }).then(
    () => { throw new Error("A linked patient record was archived."); },
    () => undefined,
  );

  const verificationPatient = await createPatient({
    fullName: "Archive Verification",
    gender: "Not specified",
    phone: `+88019${String(Date.now()).slice(-8)}`,
    careContext: "Temporary archive and recovery verification",
  });
  patientId = verificationPatient.id;
  const dayMs = new Date(protectedAppointment.startsAt).setUTCHours(0, 0, 0, 0);
  const slot = (await getAvailability(clinician.id, dayMs)).find((entry) => entry.status === "open");
  if (!slot) throw new Error("No open appointment slot was available for archive verification.");
  const created = await bookAppointment({
    patientId,
    clinicianId: clinician.id,
    startsAtMs: slot.startsAt.getTime(),
    displayName: "Archive recovery verification",
    reason: "Temporary operational workflow check",
    createdByUserId: 1,
  });
  appointmentId = created.id;
  if (created.displayName !== "Archive recovery verification") throw new Error("Appointment display name did not persist.");

  await archiveAppointment({ appointmentId, userId: 1 });
  if ((await getHmsOverview()).appointments.some((row) => row.appointment.id === appointmentId)) throw new Error("Archived appointment remained in the active overview.");
  if (!(await getArchivedRecords()).appointments.some((row) => row.appointment.id === appointmentId)) throw new Error("Archived appointment was not returned by the recovery list.");
  await restoreAppointment(appointmentId);
  if (!(await getHmsOverview()).appointments.some((row) => row.appointment.id === appointmentId)) throw new Error("Restored appointment did not return to active operations.");

  await archiveAppointment({ appointmentId, userId: 1 });
  await archivePatient({ patientId, userId: 1 });
  if ((await getHmsOverview()).patients.some((row) => row.id === patientId)) throw new Error("Archived patient remained in the active directory.");
  const archive = await getArchivedRecords();
  if (!archive.patients.some((row) => row.patient.id === patientId)) throw new Error("Archived patient was not returned by the recovery list.");
  await restorePatient(patientId);
  await restoreAppointment(appointmentId);
  console.log("Archive, restore, naming, and integrity verification passed.");
} finally {
  const db = await getDb();
  if (db && appointmentId) await db.delete(appointments).where(eq(appointments.id, appointmentId));
  if (db && patientId) await db.delete(patients).where(eq(patients.id, patientId));
}

process.exit(0);
