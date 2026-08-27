import { readFile, rm } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { getDb } from "../server/db.ts";
import { appointments, patients } from "../drizzle/schema.ts";

const fixturePath = "/tmp/hms-archive-ui-fixture.json";
try {
  const { patientId, appointmentId } = JSON.parse(await readFile(fixturePath, "utf8"));
  const db = await getDb();
  if (db) {
    await db.delete(appointments).where(eq(appointments.id, appointmentId));
    await db.delete(patients).where(eq(patients.id, patientId));
  }
} finally {
  await rm(fixturePath, { force: true });
}
console.log("Cleaned archived UI fixture.");
process.exit(0);
