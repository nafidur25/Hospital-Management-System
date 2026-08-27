import { eq } from "drizzle-orm";
import { authenticateDemoCredentials, ensureDemoCredentialAccounts, getDb } from "../server/db.ts";
import { clinicians, users } from "../drizzle/schema.ts";

const accounts = [
  ["admin@clinicalledger.demo", "CL-Admin!2026", "admin"],
  ["doctor@clinicalledger.demo", "CL-Doctor!2026", "doctor"],
  ["reception@clinicalledger.demo", "CL-Frontdesk!2026", "receptionist"],
];

await ensureDemoCredentialAccounts();
for (const [email, password, role] of accounts) {
  const user = await authenticateDemoCredentials(email, password);
  if (!user || user.role !== role) throw new Error(`Credential validation failed for ${email}`);
}
if (await authenticateDemoCredentials("doctor@clinicalledger.demo", "incorrect-password")) throw new Error("Invalid credential pair was accepted.");
const db = await getDb();
if (!db) throw new Error("Database is unavailable.");
const doctor = (await db.select().from(users).where(eq(users.openId, "demo_hms_doctor")).limit(1))[0];
const clinician = (await db.select().from(clinicians).where(eq(clinicians.fullName, "Dr. Samira Ahmed")).limit(1))[0];
if (!doctor || !clinician || clinician.userId !== doctor.id) throw new Error("Doctor account was not linked to the clinician profile.");
console.log("Demo credential verification passed for Admin, Doctor, and Receptionist.");
process.exit(0);
