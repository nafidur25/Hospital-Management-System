import { writeFile } from "node:fs/promises";
import {
  archiveAppointment,
  archivePatient,
  bookAppointment,
  createPatient,
  getAvailability,
  getHmsOverview,
} from "../server/db.ts";

const fixturePath = "/tmp/hms-archive-ui-fixture.json";
const overview = await getHmsOverview();
const clinician = overview.clinicians[0];
const referenceAppointment = overview.appointments[0]?.appointment;
if (!clinician || !referenceAppointment) throw new Error("Seeded scheduling data is unavailable.");

const patient = await createPatient({
  fullName: "Archive UI Verification",
  gender: "Not specified",
  phone: `+88018${String(Date.now()).slice(-8)}`,
  careContext: "Temporary archive workspace verification",
});
const dayMs = new Date(referenceAppointment.startsAt).setUTCHours(0, 0, 0, 0);
const slot = (await getAvailability(clinician.id, dayMs)).find((entry) => entry.status === "open");
if (!slot) throw new Error("No open slot is available for the archive UI fixture.");
const appointment = await bookAppointment({
  patientId: patient.id,
  clinicianId: clinician.id,
  startsAtMs: slot.startsAt.getTime(),
  displayName: "Archive UI recovery test",
  reason: "Temporary responsive workspace check",
  createdByUserId: 1,
});
await archiveAppointment({ appointmentId: appointment.id, userId: 1 });
await archivePatient({ patientId: patient.id, userId: 1 });
await writeFile(fixturePath, JSON.stringify({ patientId: patient.id, appointmentId: appointment.id }));
console.log(`Prepared archived UI fixture: ${fixturePath}`);
process.exit(0);
