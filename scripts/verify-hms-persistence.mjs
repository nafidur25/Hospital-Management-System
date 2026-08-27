import { eq } from "drizzle-orm";
import { getDb, ensureHmsSeed, createPatient, recordPayment } from "../server/db.ts";
import { bills, patients, payments, users } from "../drizzle/schema.ts";

const suffix = `${Date.now()}`.slice(-8);
const openId = `hms-integration-${suffix}`;
const phone = `+8801999${suffix}`;
let testUser;
let createdPatient;
let targetBill;
let originalBillStatus;

try {
  await ensureHmsSeed();
  const db = await getDb();
  if (!db) throw new Error("Database connection is unavailable.");

  await db.insert(users).values({ openId, name: "HMS Integration Verifier", loginMethod: "test", role: "admin" });
  testUser = (await db.select().from(users).where(eq(users.openId, openId)).limit(1))[0];
  if (!testUser) throw new Error("Could not create test user.");

  createdPatient = await createPatient({ fullName: `Integration Patient ${suffix}`, gender: "Other", phone, careContext: "Persistence verification" });
  const persistedPatient = (await db.select().from(patients).where(eq(patients.id, createdPatient.id)).limit(1))[0];
  if (!persistedPatient || persistedPatient.phone !== phone) throw new Error("Patient mutation did not persist.");

  targetBill = (await db.select().from(bills).where(eq(bills.billCode, "B-5003")).limit(1))[0];
  if (!targetBill) throw new Error("Expected seed bill B-5003 was not found.");
  originalBillStatus = targetBill.status;
  await recordPayment({ billId: targetBill.id, amount: 11, method: "Card", userId: testUser.id });
  const persistedPayment = (await db.select().from(payments).where(eq(payments.recordedByUserId, testUser.id)).limit(1))[0];
  const updatedBill = (await db.select().from(bills).where(eq(bills.id, targetBill.id)).limit(1))[0];
  if (!persistedPayment || Number(persistedPayment.amount) !== 11) throw new Error("Payment mutation did not persist.");
  if (updatedBill?.status !== "Partial") throw new Error("Bill status did not recalculate to Partial.");
  console.log("PASS: patient creation, payment persistence, and bill status recalculation verified.");
} finally {
  const db = await getDb();
  if (db) {
    if (testUser) await db.delete(payments).where(eq(payments.recordedByUserId, testUser.id));
    if (targetBill && originalBillStatus) await db.update(bills).set({ status: originalBillStatus }).where(eq(bills.id, targetBill.id));
    if (createdPatient) await db.delete(patients).where(eq(patients.id, createdPatient.id));
    if (testUser) await db.delete(users).where(eq(users.id, testUser.id));
  }
}

process.exit(0);
