import { and, eq } from "drizzle-orm";
import {
  createClinicalNote,
  createLaboratoryOrder,
  createPrescription,
  getDb,
  getPatientMedicalRecord,
} from "../server/db.ts";
import { clinicalNotes, laboratoryOrders, patients, prescriptionItems, prescriptions, users } from "../drizzle/schema.ts";

const token = `VERIFY-${Date.now()}`;
const db = await getDb();
if (!db) throw new Error("Database connection unavailable.");
const patient = (await db.select().from(patients).limit(1))[0];
const admin = (await db.select().from(users).where(eq(users.role, "admin")).limit(1))[0];
if (!patient || !admin) throw new Error("A seeded patient and administrator are required for verification.");

try {
  await createClinicalNote({ patientId: patient.id, clinicianId: 1, subjective: token, assessment: `${token} assessment`, plan: `${token} plan`, userId: admin.id, role: "admin" });
  await createPrescription({ patientId: patient.id, clinicianId: 1, notes: token, items: [{ medicineName: token, dosage: "1 mg", route: "Oral", frequency: "Once daily", durationDays: 1, instructions: token }], userId: admin.id, role: "admin" });
  await createLaboratoryOrder({ patientId: patient.id, clinicianId: 1, testName: token, priority: "Routine", clinicalQuestion: token, userId: admin.id, role: "admin" });
  const order = (await db.select().from(laboratoryOrders).where(eq(laboratoryOrders.testName, token)).limit(1))[0];
  if (!order) throw new Error("Laboratory order was not persisted.");
  const { recordLaboratoryResult } = await import("../server/db.ts");
  await recordLaboratoryResult({ laboratoryOrderId: order.id, clinicianId: 1, resultSummary: token, resultValue: "Verified", referenceRange: "Verification", userId: admin.id, role: "admin" });
  const record = await getPatientMedicalRecord(patient.id);
  const noteFound = record.notes.some(({ note }) => note.assessment === `${token} assessment`);
  const rxFound = record.prescriptions.some(({ items }) => items.some((item) => item.medicineName === token));
  const labFound = record.laboratoryOrders.some(({ order: row, result }) => row.testName === token && result?.resultSummary === token);
  if (!noteFound || !rxFound || !labFound) throw new Error("One or more medical-record mutations were not present in the patient timeline.");
  console.log("Medical-record persistence verification passed.");
} finally {
  await db.delete(laboratoryOrders).where(eq(laboratoryOrders.testName, token));
  const temporaryPrescriptions = await db.select({ id: prescriptions.id }).from(prescriptions).where(eq(prescriptions.notes, token));
  for (const prescription of temporaryPrescriptions) {
    await db.delete(prescriptionItems).where(eq(prescriptionItems.prescriptionId, prescription.id));
    await db.delete(prescriptions).where(eq(prescriptions.id, prescription.id));
  }
  await db.delete(clinicalNotes).where(and(eq(clinicalNotes.patientId, patient.id), eq(clinicalNotes.subjective, token)));
}

process.exit(0);
