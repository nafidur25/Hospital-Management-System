import { and, asc, desc, eq, gt, inArray, isNotNull, isNull, lt, ne } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import {
  appointments,
  availabilityWindows,
  bills,
  clinicians,
  clinicalNotes,
  InsertUser,
  laboratoryOrders,
  laboratoryResults,
  patients,
  payments,
  prescriptionItems,
  prescriptions,
  users,
  type User,
  type Clinician,
  type Patient,
  type Appointment,
  type ClinicalNote,
  type Prescription,
  type LaboratoryOrder,
} from "../drizzle/schema";
import type { HmsRole } from "../shared/hmsAccess";
import { ENV } from "./_core/env";
import { buildAvailabilitySlots, startOfUtcDay, validateBookingRequest } from "./scheduling";

let _db: ReturnType<typeof drizzle> | null = null;
type Gender = "Female" | "Male" | "Other" | "Not specified";
type AppointmentStatus = "Scheduled" | "Checked in" | "Completed" | "Cancelled";
type PaymentMethod = "Cash" | "Card" | "Mobile banking" | "Insurance";

export const DEMO_ACCOUNTS = [
  { openId: "demo_hms_admin", email: "admin@clinicalledger.demo", name: "Amelia Rahman", role: "admin" as const, passwordHash: "73a5b98a3b9297374a8c141ace206e9e:db040ccf69e944325b6b0c5bf85b3ec4c0a4acc27560a40687d2cda16b64aa3bfbd20a0ce5fbe9d187eac4d88b7e4b3d346c539085fa0991b0f2db1807527306" },
  { openId: "demo_hms_doctor", email: "doctor@clinicalledger.demo", name: "Dr. Samira Ahmed", role: "doctor" as const, passwordHash: "8aa44b54d3e5c66062947db3a2830fe2:926e375cec3aa559a0fb4ce6028fffacd678f62f31a8c3018025fb13087509fb2c819d3d05c8b0ffd8437c8824c229d46422f075de263f359ee46d015cef4c41" },
  { openId: "demo_hms_reception", email: "reception@clinicalledger.demo", name: "Nusrat Jahan", role: "receptionist" as const, passwordHash: "dc8c723d22173b3394c792b7f4362998:575d153b4cd069a669b8df4719fe9a93984b013e81d5e804c25e4469642649bebffa9fbd47fc470405b3cf525ca9e3de3f5e4350e39145daf7e6be277940c91d" },
];

export function setDb(db: any) {
  _db = db;
}

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    const client = postgres(process.env.DATABASE_URL, {
      ssl: process.env.DATABASE_URL.includes("localhost") ? false : { rejectUnauthorized: false },
      max: 10,
    });
    _db = drizzle(client);
  }
  return _db;
}

function verifyPassword(password: string, encodedHash: string) {
  const [salt, hash] = encodedHash.split(":");
  if (!salt || !hash) return false;
  const derived = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}

function demoDay(offset = 0) { const today = startOfUtcDay(new Date()); return new Date(today.getTime() + offset * 86_400_000); }
function atUtcDay(day: Date, hour: number, minute: number) { return new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hour, minute)); }

// ─── IN-MEMORY LOCAL DATA STORE (Offline / Dev Fallback) ──────────────────────
type AvailabilityWindowRow = { id: number; clinicianId: number; weekday: number; startMinute: number; endMinute: number; slotMinutes: number };
type BillRow = { id: number; billCode: string; patientId: number; appointmentId: number | null; totalAmount: string; status: "Paid" | "Partial" | "Due" | "Cancelled"; issuedAt: Date };
type PaymentRow = { id: number; billId: number; amount: string; method: PaymentMethod; receivedAt: Date; recordedByUserId: number | null };
type PrescriptionItemRow = { id: number; prescriptionId: number; medicineName: string; dosage: string; route: string; frequency: string; durationDays: number | null; instructions: string | null };
type LabResultRow = { id: number; laboratoryOrderId: number; reportedByClinicianId: number | null; resultSummary: string; referenceRange: string | null; resultValue: string | null; reportedAt: Date };

interface MemoryDb {
  users: User[];
  clinicians: Clinician[];
  patients: Patient[];
  availabilityWindows: AvailabilityWindowRow[];
  appointments: Appointment[];
  bills: BillRow[];
  payments: PaymentRow[];
  clinicalNotes: ClinicalNote[];
  prescriptions: Prescription[];
  prescriptionItems: PrescriptionItemRow[];
  laboratoryOrders: LaboratoryOrder[];
  laboratoryResults: LabResultRow[];
  nextId: Record<string, number>;
  initialized: boolean;
}

const memoryDb: MemoryDb = {
  users: [],
  clinicians: [],
  patients: [],
  availabilityWindows: [],
  appointments: [],
  bills: [],
  payments: [],
  clinicalNotes: [],
  prescriptions: [],
  prescriptionItems: [],
  laboratoryOrders: [],
  laboratoryResults: [],
  nextId: {
    users: 10,
    clinicians: 10,
    patients: 10,
    availabilityWindows: 100,
    appointments: 100,
    bills: 100,
    payments: 100,
    clinicalNotes: 100,
    prescriptions: 100,
    prescriptionItems: 100,
    laboratoryOrders: 100,
    laboratoryResults: 100,
  },
  initialized: false,
};

function initMemoryDb() {
  if (memoryDb.initialized) return;
  memoryDb.initialized = true;

  const now = new Date();
  memoryDb.users = DEMO_ACCOUNTS.map((acc, i) => ({
    id: i + 1,
    openId: acc.openId,
    name: acc.name,
    email: acc.email,
    loginMethod: "credential-demo",
    passwordHash: acc.passwordHash,
    role: acc.role,
    isActive: "yes",
    createdAt: now,
    updatedAt: now,
    lastSignedIn: now,
  }));

  memoryDb.clinicians = [
    { id: 1, userId: 2, fullName: "Dr. Samira Ahmed", specialty: "Cardiology", department: "Cardiology", color: "#007C83", isActive: "yes", createdAt: now },
    { id: 2, userId: null, fullName: "Dr. Mahmud Hasan", specialty: "Endocrinology", department: "Internal Medicine", color: "#386B9D", isActive: "yes", createdAt: now },
    { id: 3, userId: null, fullName: "Dr. Tahmina Noor", specialty: "Pathology", department: "Laboratory", color: "#8A5A9B", isActive: "yes", createdAt: now },
    { id: 4, userId: null, fullName: "Dr. Imran Kabir", specialty: "General Medicine", department: "Outpatient", color: "#A56B31", isActive: "yes", createdAt: now },
  ];

  memoryDb.patients = [
    { id: 1, patientCode: "P-1001", fullName: "Ayesha Rahman", dateOfBirth: null, gender: "Female", phone: "+8801711234890", email: null, careContext: "Hypertension review", archivedAt: null, archivedByUserId: null, createdAt: now },
    { id: 2, patientCode: "P-1002", fullName: "Karim Hossain", dateOfBirth: null, gender: "Male", phone: "+8801814876122", email: null, careContext: "Diabetes follow-up", archivedAt: null, archivedByUserId: null, createdAt: now },
    { id: 3, patientCode: "P-1003", fullName: "Nabila Islam", dateOfBirth: null, gender: "Female", phone: "+8801612551809", email: null, careContext: "Laboratory order", archivedAt: null, archivedByUserId: null, createdAt: now },
    { id: 4, patientCode: "P-1004", fullName: "Rafiq Ahmed", dateOfBirth: null, gender: "Male", phone: "+8801911204778", email: null, careContext: "Cardiology consult", archivedAt: null, archivedByUserId: null, createdAt: now },
    { id: 5, patientCode: "P-1005", fullName: "Farzana Khan", dateOfBirth: null, gender: "Female", phone: "+8801755660009", email: null, careContext: "Medication refill", archivedAt: null, archivedByUserId: null, createdAt: now },
  ];

  let awId = 1;
  memoryDb.availabilityWindows = [1, 2, 3, 4].flatMap((clinicianId) =>
    [1, 2, 3, 4, 5].map((weekday) => ({
      id: awId++,
      clinicianId,
      weekday,
      startMinute: 540,
      endMinute: 1020,
      slotMinutes: 30,
    }))
  );

  const day = demoDay();
  memoryDb.appointments = [
    { id: 1, appointmentCode: "A-4016", patientId: 1, clinicianId: 1, startsAt: atUtcDay(day, 9, 0), endsAt: atUtcDay(day, 9, 30), displayName: null, reason: "Follow-up ECG", status: "Scheduled", createdByUserId: 1, archivedAt: null, archivedByUserId: null, createdAt: now, updatedAt: now },
    { id: 2, appointmentCode: "A-4017", patientId: 2, clinicianId: 2, startsAt: atUtcDay(day, 10, 30), endsAt: atUtcDay(day, 11, 0), displayName: null, reason: "Diabetes review", status: "Checked in", createdByUserId: 1, archivedAt: null, archivedByUserId: null, createdAt: now, updatedAt: now },
    { id: 3, appointmentCode: "A-4018", patientId: 3, clinicianId: 3, startsAt: atUtcDay(day, 11, 15), endsAt: atUtcDay(day, 11, 45), displayName: null, reason: "CBC result review", status: "Scheduled", createdByUserId: 1, archivedAt: null, archivedByUserId: null, createdAt: now, updatedAt: now },
    { id: 4, appointmentCode: "A-4019", patientId: 4, clinicianId: 1, startsAt: atUtcDay(day, 13, 45), endsAt: atUtcDay(day, 14, 15), displayName: null, reason: "New consultation", status: "Scheduled", createdByUserId: 1, archivedAt: null, archivedByUserId: null, createdAt: now, updatedAt: now },
  ];

  memoryDb.bills = [
    { id: 1, billCode: "B-5001", patientId: 1, appointmentId: 1, totalAmount: "5420.00", status: "Partial", issuedAt: now },
    { id: 2, billCode: "B-5002", patientId: 2, appointmentId: 2, totalAmount: "3200.00", status: "Paid", issuedAt: now },
    { id: 3, billCode: "B-5003", patientId: 3, appointmentId: 3, totalAmount: "2750.00", status: "Due", issuedAt: now },
  ];

  memoryDb.payments = [
    { id: 1, billId: 1, amount: "2400.00", method: "Mobile banking", receivedAt: now, recordedByUserId: 1 },
    { id: 2, billId: 2, amount: "3200.00", method: "Card", receivedAt: now, recordedByUserId: 1 },
  ];

  memoryDb.clinicalNotes = [
    { id: 1, patientId: 1, appointmentId: 1, authorClinicianId: 1, authorUserId: 2, subjective: "Reports intermittent headaches with home blood-pressure readings above baseline.", assessment: "Essential hypertension requiring adherence review and cardiovascular risk follow-up.", plan: "Continue amlodipine, review ECG, and repeat blood-pressure check in four weeks.", createdAt: now, updatedAt: now },
    { id: 2, patientId: 3, appointmentId: 3, authorClinicianId: 3, authorUserId: 1, subjective: "Attended to discuss CBC and ESR laboratory review.", assessment: "Laboratory follow-up required; no immediate escalation noted in the clinical record.", plan: "Review available results with the treating clinician and document follow-up guidance.", createdAt: now, updatedAt: now },
  ];

  memoryDb.prescriptions = [
    { id: 1, prescriptionCode: "RX-7001", patientId: 1, appointmentId: 1, prescriberClinicianId: 1, authorUserId: 2, notes: "Take consistently and bring home blood-pressure readings to follow-up.", status: "Active", prescribedAt: now },
  ];

  memoryDb.prescriptionItems = [
    { id: 1, prescriptionId: 1, medicineName: "Amlodipine", dosage: "5 mg", route: "Oral", frequency: "Once daily", durationDays: 30, instructions: "Take in the morning." },
  ];

  memoryDb.laboratoryOrders = [
    { id: 1, orderCode: "LAB-8101", patientId: 1, appointmentId: 1, orderingClinicianId: 1, authorUserId: 2, testName: "Lipid profile", priority: "Routine", status: "Resulted", clinicalQuestion: "Cardiovascular risk review in hypertension follow-up.", orderedAt: now },
  ];

  memoryDb.laboratoryResults = [
    { id: 1, laboratoryOrderId: 1, reportedByClinicianId: 3, resultSummary: "Lipid profile completed and available for treating clinician review.", referenceRange: "Laboratory reference interval", resultValue: "Result available", reportedAt: now },
  ];
}

initMemoryDb();

// ─── USER & AUTHENTICATION ───────────────────────────────────────────────────

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (db) {
    const values: InsertUser = { openId: user.openId, lastSignedIn: new Date() };
    const updateSet: Record<string, unknown> = { lastSignedIn: new Date() };
    (["name", "email", "loginMethod"] as const).forEach((field) => {
      if (user[field] !== undefined) {
        values[field] = user[field] ?? null;
        updateSet[field] = user[field] ?? null;
      }
    });
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }
    await db.insert(users).values(values).onConflictDoUpdate({ target: users.openId, set: updateSet });
    return;
  }

  // In-memory fallback
  initMemoryDb();
  const existing = memoryDb.users.find((u) => u.openId === user.openId);
  const now = new Date();
  if (existing) {
    if (user.name !== undefined) existing.name = user.name ?? null;
    if (user.email !== undefined) existing.email = user.email ?? null;
    if (user.loginMethod !== undefined) existing.loginMethod = user.loginMethod ?? null;
    if (user.role !== undefined) existing.role = user.role;
    existing.lastSignedIn = now;
    existing.updatedAt = now;
  } else {
    const newId = memoryDb.nextId.users++;
    memoryDb.users.push({
      id: newId,
      openId: user.openId,
      name: user.name ?? null,
      email: user.email ?? null,
      loginMethod: user.loginMethod ?? null,
      passwordHash: null,
      role: user.role ?? (user.openId === ENV.ownerOpenId ? "admin" : "receptionist"),
      isActive: "yes",
      createdAt: now,
      updatedAt: now,
      lastSignedIn: now,
    });
  }
}

export async function getUserByOpenId(openId: string): Promise<User | undefined> {
  const db = await getDb();
  if (db) {
    return (await db.select().from(users).where(eq(users.openId, openId)).limit(1))[0];
  }
  initMemoryDb();
  return memoryDb.users.find((u) => u.openId === openId);
}

export async function ensureDemoCredentialAccounts() {
  await ensureHmsSeed();
  const db = await getDb();
  if (db) {
    for (const account of DEMO_ACCOUNTS) {
      await db.insert(users).values({ openId: account.openId, email: account.email, name: account.name, loginMethod: "credential-demo", passwordHash: account.passwordHash, role: account.role, isActive: "yes", lastSignedIn: new Date() }).onConflictDoUpdate({ target: users.openId, set: { email: account.email, name: account.name, loginMethod: "credential-demo" } });
    }
    const doctor = (await db.select().from(users).where(eq(users.openId, "demo_hms_doctor")).limit(1))[0];
    const clinician = (await db.select().from(clinicians).where(eq(clinicians.fullName, "Dr. Samira Ahmed")).limit(1))[0];
    if (doctor && clinician && clinician.userId !== doctor.id) await db.update(clinicians).set({ userId: doctor.id }).where(eq(clinicians.id, clinician.id));
    return;
  }

  // In-memory fallback
  initMemoryDb();
  const doctorUser = memoryDb.users.find((u) => u.openId === "demo_hms_doctor");
  const doctorClinician = memoryDb.clinicians.find((c) => c.fullName === "Dr. Samira Ahmed");
  if (doctorUser && doctorClinician) {
    doctorClinician.userId = doctorUser.id;
  }
}

export async function authenticateDemoCredentials(email: string, password: string): Promise<User | undefined> {
  await ensureDemoCredentialAccounts();
  const db = await getDb();
  if (db) {
    const user = (await db.select().from(users).where(eq(users.email, email.trim().toLowerCase())).limit(1))[0];
    if (!user || user.isActive !== "yes" || user.loginMethod !== "credential-demo" || !user.passwordHash || !verifyPassword(password, user.passwordHash)) return undefined;
    await db.update(users).set({ lastSignedIn: new Date(), updatedAt: new Date() }).where(eq(users.id, user.id));
    return (await db.select().from(users).where(eq(users.id, user.id)).limit(1))[0];
  }

  // In-memory fallback
  initMemoryDb();
  const normEmail = email.trim().toLowerCase();
  const user = memoryDb.users.find((u) => u.email?.toLowerCase() === normEmail);
  if (!user || user.isActive !== "yes" || user.loginMethod !== "credential-demo" || !user.passwordHash || !verifyPassword(password, user.passwordHash)) {
    return undefined;
  }
  user.lastSignedIn = new Date();
  return user;
}

export async function listManagedAccounts() {
  const db = await getDb();
  if (db) {
    return db.select({
      user: { id: users.id, name: users.name, email: users.email, role: users.role, isActive: users.isActive, loginMethod: users.loginMethod, lastSignedIn: users.lastSignedIn },
      clinician: { id: clinicians.id, fullName: clinicians.fullName, specialty: clinicians.specialty },
    }).from(users).leftJoin(clinicians, eq(clinicians.userId, users.id)).orderBy(asc(users.name));
  }

  initMemoryDb();
  return memoryDb.users
    .map((user) => {
      const clinician = memoryDb.clinicians.find((c) => c.userId === user.id) || null;
      return {
        user: { id: user.id, name: user.name, email: user.email, role: user.role, isActive: user.isActive, loginMethod: user.loginMethod, lastSignedIn: user.lastSignedIn },
        clinician: clinician ? { id: clinician.id, fullName: clinician.fullName, specialty: clinician.specialty } : null,
      };
    })
    .sort((a, b) => (a.user.name || "").localeCompare(b.user.name || ""));
}

export async function createManagedAccount(input: { name: string; email: string; password: string; role: HmsRole; clinicianId?: number }) {
  await ensureHmsSeed();
  const db = await getDb();
  const email = input.email.trim().toLowerCase();
  const openId = `managed_${randomBytes(16).toString("hex")}`;

  if (db) {
    await db.transaction(async (tx) => {
      await tx.insert(users).values({ openId, name: input.name.trim(), email, loginMethod: "credential-demo", passwordHash: hashPassword(input.password), role: input.role, isActive: "yes", lastSignedIn: new Date() });
      const account = (await tx.select().from(users).where(eq(users.openId, openId)).limit(1))[0]!;
      if (input.clinicianId) await tx.update(clinicians).set({ userId: account.id }).where(eq(clinicians.id, input.clinicianId));
    });
    return (await db.select().from(users).where(eq(users.openId, openId)).limit(1))[0]!;
  }

  initMemoryDb();
  const newId = memoryDb.nextId.users++;
  const now = new Date();
  const newUser: User = {
    id: newId,
    openId,
    name: input.name.trim(),
    email,
    loginMethod: "credential-demo",
    passwordHash: hashPassword(input.password),
    role: input.role,
    isActive: "yes",
    createdAt: now,
    updatedAt: now,
    lastSignedIn: now,
  };
  memoryDb.users.push(newUser);
  if (input.clinicianId) {
    const clinician = memoryDb.clinicians.find((c) => c.id === input.clinicianId);
    if (clinician) clinician.userId = newId;
  }
  return newUser;
}

export async function updateManagedAccount(input: { userId: number; name: string; email: string; role: HmsRole; clinicianId?: number | null }) {
  const db = await getDb();
  if (db) {
    await db.transaction(async (tx) => {
      await tx.update(users).set({ name: input.name.trim(), email: input.email.trim().toLowerCase(), role: input.role, updatedAt: new Date() }).where(eq(users.id, input.userId));
      if (input.clinicianId !== undefined) {
        await tx.update(clinicians).set({ userId: null }).where(eq(clinicians.userId, input.userId));
        if (input.clinicianId) await tx.update(clinicians).set({ userId: input.userId }).where(eq(clinicians.id, input.clinicianId));
      }
    });
    return { success: true } as const;
  }

  initMemoryDb();
  const user = memoryDb.users.find((u) => u.id === input.userId);
  if (user) {
    user.name = input.name.trim();
    user.email = input.email.trim().toLowerCase();
    user.role = input.role;
  }
  if (input.clinicianId !== undefined) {
    const prevClinician = memoryDb.clinicians.find((c) => c.userId === input.userId);
    if (prevClinician) prevClinician.userId = null;
    if (input.clinicianId) {
      const targetClinician = memoryDb.clinicians.find((c) => c.id === input.clinicianId);
      if (targetClinician) targetClinician.userId = input.userId;
    }
  }
  return { success: true } as const;
}

export async function resetManagedAccountPassword(userId: number, password: string) {
  const db = await getDb();
  if (db) {
    await db.update(users).set({ passwordHash: hashPassword(password), loginMethod: "credential-demo", updatedAt: new Date() }).where(eq(users.id, userId));
    return { success: true } as const;
  }
  initMemoryDb();
  const user = memoryDb.users.find((u) => u.id === userId);
  if (user) {
    user.passwordHash = hashPassword(password);
    user.loginMethod = "credential-demo";
  }
  return { success: true } as const;
}

export async function setManagedAccountActive(userId: number, isActive: "yes" | "no") {
  const db = await getDb();
  if (db) {
    await db.update(users).set({ isActive, updatedAt: new Date() }).where(eq(users.id, userId));
    return { success: true } as const;
  }
  initMemoryDb();
  const user = memoryDb.users.find((u) => u.id === userId);
  if (user) user.isActive = isActive;
  return { success: true } as const;
}

// ─── HMS SEED DATA ───────────────────────────────────────────────────────────

export async function ensureHmsSeed() {
  const db = await getDb();
  if (!db) {
    initMemoryDb();
    return;
  }
  const existing = await db.select({ id: patients.id }).from(patients).limit(1);
  if (existing.length) return;

  await db.insert(clinicians).values([
    { fullName: "Dr. Samira Ahmed", specialty: "Cardiology", department: "Cardiology", color: "#007C83" },
    { fullName: "Dr. Mahmud Hasan", specialty: "Endocrinology", department: "Internal Medicine", color: "#386B9D" },
    { fullName: "Dr. Tahmina Noor", specialty: "Pathology", department: "Laboratory", color: "#8A5A9B" },
    { fullName: "Dr. Imran Kabir", specialty: "General Medicine", department: "Outpatient", color: "#A56B31" },
  ]);
  await db.insert(patients).values([
    { patientCode: "P-1001", fullName: "Ayesha Rahman", gender: "Female", phone: "+8801711234890", careContext: "Hypertension review" },
    { patientCode: "P-1002", fullName: "Karim Hossain", gender: "Male", phone: "+8801814876122", careContext: "Diabetes follow-up" },
    { patientCode: "P-1003", fullName: "Nabila Islam", gender: "Female", phone: "+8801612551809", careContext: "Laboratory order" },
    { patientCode: "P-1004", fullName: "Rafiq Ahmed", gender: "Male", phone: "+8801911204778", careContext: "Cardiology consult" },
    { patientCode: "P-1005", fullName: "Farzana Khan", gender: "Female", phone: "+8801755660009", careContext: "Medication refill" },
  ]);
  const clinicianRows = await db.select().from(clinicians).orderBy(asc(clinicians.id));
  const patientRows = await db.select().from(patients).orderBy(asc(patients.id));
  const clinicianIds = clinicianRows.map((clinician) => clinician.id);
  await db.insert(availabilityWindows).values(clinicianIds.flatMap((clinicianId) => [1, 2, 3, 4, 5].map((weekday) => ({ clinicianId, weekday, startMinute: 540, endMinute: 1020, slotMinutes: 30 }))));
  const day = demoDay();
  await db.insert(appointments).values([
    { appointmentCode: "A-4016", patientId: patientRows[0]!.id, clinicianId: clinicianRows[0]!.id, startsAt: atUtcDay(day, 9, 0), endsAt: atUtcDay(day, 9, 30), reason: "Follow-up ECG", status: "Scheduled" },
    { appointmentCode: "A-4017", patientId: patientRows[1]!.id, clinicianId: clinicianRows[1]!.id, startsAt: atUtcDay(day, 10, 30), endsAt: atUtcDay(day, 11, 0), reason: "Diabetes review", status: "Checked in" },
    { appointmentCode: "A-4018", patientId: patientRows[2]!.id, clinicianId: clinicianRows[2]!.id, startsAt: atUtcDay(day, 11, 15), endsAt: atUtcDay(day, 11, 45), reason: "CBC result review", status: "Scheduled" },
    { appointmentCode: "A-4019", patientId: patientRows[3]!.id, clinicianId: clinicianRows[0]!.id, startsAt: atUtcDay(day, 13, 45), endsAt: atUtcDay(day, 14, 15), reason: "New consultation", status: "Scheduled" },
  ]);
  const appointmentRows = await db.select().from(appointments).orderBy(asc(appointments.id));
  await db.insert(bills).values([
    { billCode: "B-5001", patientId: patientRows[0]!.id, appointmentId: appointmentRows[0]!.id, totalAmount: "5420.00", status: "Partial" },
    { billCode: "B-5002", patientId: patientRows[1]!.id, appointmentId: appointmentRows[1]!.id, totalAmount: "3200.00", status: "Paid" },
    { billCode: "B-5003", patientId: patientRows[2]!.id, appointmentId: appointmentRows[2]!.id, totalAmount: "2750.00", status: "Due" },
  ]);
  const billRows = await db.select().from(bills).orderBy(asc(bills.id));
  await db.insert(payments).values([{ billId: billRows[0]!.id, amount: "2400.00", method: "Mobile banking" }, { billId: billRows[1]!.id, amount: "3200.00", method: "Card" }]);
}

export async function ensureMedicalRecordSeed() {
  await ensureHmsSeed();
  const db = await getDb();
  if (!db) {
    initMemoryDb();
    return;
  }
  if ((await db.select({ id: clinicalNotes.id }).from(clinicalNotes).limit(1)).length) return;
  const [patientRows, clinicianRows, appointmentRows] = await Promise.all([
    db.select().from(patients).orderBy(asc(patients.id)),
    db.select().from(clinicians).orderBy(asc(clinicians.id)),
    db.select().from(appointments).orderBy(asc(appointments.id)),
  ]);
  const ayesha = patientRows[0]!;
  const nabila = patientRows[2]!;
  const samira = clinicianRows[0]!;
  const tahmina = clinicianRows[2]!;
  await db.insert(clinicalNotes).values([
    { patientId: ayesha.id, appointmentId: appointmentRows[0]?.id, authorClinicianId: samira.id, subjective: "Reports intermittent headaches with home blood-pressure readings above baseline.", assessment: "Essential hypertension requiring adherence review and cardiovascular risk follow-up.", plan: "Continue amlodipine, review ECG, and repeat blood-pressure check in four weeks." },
    { patientId: nabila.id, appointmentId: appointmentRows[2]?.id, authorClinicianId: tahmina.id, subjective: "Attended to discuss CBC and ESR laboratory review.", assessment: "Laboratory follow-up required; no immediate escalation noted in the clinical record.", plan: "Review available results with the treating clinician and document follow-up guidance." },
  ]);
  await db.insert(prescriptions).values({ prescriptionCode: "RX-7001", patientId: ayesha.id, appointmentId: appointmentRows[0]?.id, prescriberClinicianId: samira.id, notes: "Take consistently and bring home blood-pressure readings to follow-up." });
  const rx = (await db.select().from(prescriptions).where(eq(prescriptions.prescriptionCode, "RX-7001")).limit(1))[0]!;
  await db.insert(prescriptionItems).values([{ prescriptionId: rx.id, medicineName: "Amlodipine", dosage: "5 mg", route: "Oral", frequency: "Once daily", durationDays: 30, instructions: "Take in the morning." }]);
  await db.insert(laboratoryOrders).values({ orderCode: "LAB-8101", patientId: ayesha.id, appointmentId: appointmentRows[0]?.id, orderingClinicianId: samira.id, testName: "Lipid profile", priority: "Routine", status: "Resulted", clinicalQuestion: "Cardiovascular risk review in hypertension follow-up." });
  const labOrder = (await db.select().from(laboratoryOrders).where(eq(laboratoryOrders.orderCode, "LAB-8101")).limit(1))[0]!;
  await db.insert(laboratoryResults).values({ laboratoryOrderId: labOrder.id, reportedByClinicianId: tahmina.id, resultSummary: "Lipid profile completed and available for treating clinician review.", referenceRange: "Laboratory reference interval", resultValue: "Result available" });
}

// ─── HMS CORE QUERIES ────────────────────────────────────────────────────────

export async function getHmsOverview() {
  await ensureHmsSeed();
  const db = await getDb();
  if (db) {
    const [clinicianRows, patientRows, appointmentRows] = await Promise.all([
      db.select().from(clinicians).where(eq(clinicians.isActive, "yes")).orderBy(asc(clinicians.fullName)),
      db.select().from(patients).where(isNull(patients.archivedAt)).orderBy(asc(patients.fullName)),
      db.select({ appointment: appointments, patient: patients, clinician: clinicians }).from(appointments).innerJoin(patients, eq(appointments.patientId, patients.id)).innerJoin(clinicians, eq(appointments.clinicianId, clinicians.id)).where(and(isNull(appointments.archivedAt), isNull(patients.archivedAt))).orderBy(asc(appointments.startsAt)),
    ]);
    return { clinicians: clinicianRows, patients: patientRows, appointments: appointmentRows };
  }

  initMemoryDb();
  const activeClinicians = memoryDb.clinicians.filter((c) => c.isActive === "yes").sort((a, b) => a.fullName.localeCompare(b.fullName));
  const activePatients = memoryDb.patients.filter((p) => p.archivedAt === null).sort((a, b) => a.fullName.localeCompare(b.fullName));
  const activeAppointments = memoryDb.appointments
    .filter((a) => a.archivedAt === null)
    .map((a) => {
      const patient = memoryDb.patients.find((p) => p.id === a.patientId && p.archivedAt === null);
      const clinician = memoryDb.clinicians.find((c) => c.id === a.clinicianId);
      if (!patient || !clinician) return null;
      return { appointment: a, patient, clinician };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => new Date(a.appointment.startsAt).getTime() - new Date(b.appointment.startsAt).getTime());

  return { clinicians: activeClinicians, patients: activePatients, appointments: activeAppointments };
}

export async function getBillingDesk() {
  await ensureHmsSeed();
  const db = await getDb();
  if (db) {
    const [billRows, paymentRows] = await Promise.all([
      db.select({ bill: bills, patient: patients }).from(bills).innerJoin(patients, eq(bills.patientId, patients.id)).orderBy(asc(bills.issuedAt)),
      db.select().from(payments),
    ]);
    const paymentTotals = paymentRows.reduce<Record<number, number>>((totals, payment) => ({ ...totals, [payment.billId]: (totals[payment.billId] ?? 0) + Number(payment.amount) }), {});
    const totalBilled = billRows.reduce((sum, row) => sum + Number(row.bill.totalAmount), 0);
    const totalCollected = Object.values(paymentTotals).reduce((sum, amount) => sum + amount, 0);
    return { bills: billRows, paymentTotals, financialSummary: { totalBilled, totalCollected, outstanding: totalBilled - totalCollected } };
  }

  initMemoryDb();
  const billRows = memoryDb.bills
    .map((b) => {
      const patient = memoryDb.patients.find((p) => p.id === b.patientId);
      if (!patient) return null;
      return { bill: b, patient };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => new Date(a.bill.issuedAt).getTime() - new Date(b.bill.issuedAt).getTime());

  const paymentTotals = memoryDb.payments.reduce<Record<number, number>>(
    (totals, p) => ({ ...totals, [p.billId]: (totals[p.billId] ?? 0) + Number(p.amount) }),
    {}
  );
  const totalBilled = billRows.reduce((sum, row) => sum + Number(row.bill.totalAmount), 0);
  const totalCollected = Object.values(paymentTotals).reduce((sum, amount) => sum + amount, 0);
  return { bills: billRows, paymentTotals, financialSummary: { totalBilled, totalCollected, outstanding: totalBilled - totalCollected } };
}

export async function getAvailability(clinicianId: number, dayMs: number) {
  await ensureHmsSeed();
  const db = await getDb();
  const day = startOfUtcDay(new Date(dayMs)); const nextDay = new Date(day.getTime() + 86_400_000);
  if (db) {
    const [windows, scheduled] = await Promise.all([
      db.select().from(availabilityWindows).where(eq(availabilityWindows.clinicianId, clinicianId)),
      db.select().from(appointments).where(and(eq(appointments.clinicianId, clinicianId), isNull(appointments.archivedAt), ne(appointments.status, "Cancelled"), lt(appointments.startsAt, nextDay), gt(appointments.endsAt, day))),
    ]);
    return buildAvailabilitySlots(day, windows, scheduled);
  }

  initMemoryDb();
  const windows = memoryDb.availabilityWindows.filter((w) => w.clinicianId === clinicianId);
  const scheduled = memoryDb.appointments.filter(
    (a) => a.clinicianId === clinicianId && a.archivedAt === null && a.status !== "Cancelled" && new Date(a.startsAt) < nextDay && new Date(a.endsAt) > day
  );
  return buildAvailabilitySlots(day, windows, scheduled);
}

export async function createPatient(input: { fullName: string; gender: Gender; phone: string; careContext: string }) {
  await ensureHmsSeed();
  const db = await getDb();
  const suffix = String(Date.now()).slice(-6);
  if (db) {
    await db.insert(patients).values({ patientCode: `P-${suffix}`, fullName: input.fullName, gender: input.gender, phone: input.phone.replace(/\s/g, ""), careContext: input.careContext });
    return (await db.select().from(patients).where(eq(patients.patientCode, `P-${suffix}`)).limit(1))[0]!;
  }

  initMemoryDb();
  const newPatient: Patient = {
    id: memoryDb.nextId.patients++,
    patientCode: `P-${suffix}`,
    fullName: input.fullName.trim(),
    dateOfBirth: null,
    gender: input.gender,
    phone: input.phone.replace(/\s/g, ""),
    email: null,
    careContext: input.careContext.trim(),
    archivedAt: null,
    archivedByUserId: null,
    createdAt: new Date(),
  };
  memoryDb.patients.push(newPatient);
  return newPatient;
}

export async function updatePatient(input: { patientId: number; fullName: string; gender: Gender; phone: string; careContext: string }) {
  const db = await getDb();
  if (db) {
    await db.update(patients).set({ fullName: input.fullName.trim(), gender: input.gender, phone: input.phone.replace(/\s/g, ""), careContext: input.careContext.trim() }).where(and(eq(patients.id, input.patientId), isNull(patients.archivedAt)));
    const patient = (await db.select().from(patients).where(and(eq(patients.id, input.patientId), isNull(patients.archivedAt))).limit(1))[0];
    if (!patient) throw new Error("Patient record was not found in the active registry.");
    return patient;
  }

  initMemoryDb();
  const patient = memoryDb.patients.find((p) => p.id === input.patientId && p.archivedAt === null);
  if (!patient) throw new Error("Patient record was not found in the active registry.");
  patient.fullName = input.fullName.trim();
  patient.gender = input.gender;
  patient.phone = input.phone.replace(/\s/g, "");
  patient.careContext = input.careContext.trim();
  return patient;
}

export async function bookAppointment(input: { patientId: number; clinicianId: number; startsAtMs: number; displayName?: string; reason: string; createdByUserId: number }) {
  await ensureHmsSeed();
  const db = await getDb();
  const startsAt = new Date(input.startsAtMs); const endsAt = new Date(startsAt.getTime() + 30 * 60_000); const weekday = startsAt.getUTCDay();

  if (db) {
    return db.transaction(async (tx) => {
      const [patient] = await tx.select({ id: patients.id }).from(patients).where(and(eq(patients.id, input.patientId), isNull(patients.archivedAt))).limit(1);
      if (!patient) throw new Error("Choose a patient from the active registry.");
      const [clinicianWindows, scheduled] = await Promise.all([
        tx.select().from(availabilityWindows).where(and(eq(availabilityWindows.clinicianId, input.clinicianId), eq(availabilityWindows.weekday, weekday))),
        tx.select().from(appointments).where(and(eq(appointments.clinicianId, input.clinicianId), isNull(appointments.archivedAt), ne(appointments.status, "Cancelled"), lt(appointments.startsAt, endsAt), gt(appointments.endsAt, startsAt))),
      ]);
      validateBookingRequest(startsAt, endsAt, clinicianWindows, scheduled);
      const appointmentCode = `A-${String(Date.now()).slice(-6)}`;
      await tx.insert(appointments).values({ appointmentCode, patientId: input.patientId, clinicianId: input.clinicianId, startsAt, endsAt, displayName: input.displayName?.trim() || null, reason: input.reason, status: "Scheduled", createdByUserId: input.createdByUserId });
      return (await tx.select().from(appointments).where(eq(appointments.appointmentCode, appointmentCode)).limit(1))[0]!;
    });
  }

  initMemoryDb();
  const patient = memoryDb.patients.find((p) => p.id === input.patientId && p.archivedAt === null);
  if (!patient) throw new Error("Choose a patient from the active registry.");
  const clinicianWindows = memoryDb.availabilityWindows.filter((w) => w.clinicianId === input.clinicianId && w.weekday === weekday);
  const scheduled = memoryDb.appointments.filter(
    (a) => a.clinicianId === input.clinicianId && a.archivedAt === null && a.status !== "Cancelled" && new Date(a.startsAt) < endsAt && new Date(a.endsAt) > startsAt
  );
  validateBookingRequest(startsAt, endsAt, clinicianWindows, scheduled);
  const appointmentCode = `A-${String(Date.now()).slice(-6)}`;
  const now = new Date();
  const newAppointment: Appointment = {
    id: memoryDb.nextId.appointments++,
    appointmentCode,
    patientId: input.patientId,
    clinicianId: input.clinicianId,
    startsAt,
    endsAt,
    displayName: input.displayName?.trim() || null,
    reason: input.reason.trim(),
    status: "Scheduled",
    createdByUserId: input.createdByUserId,
    archivedAt: null,
    archivedByUserId: null,
    createdAt: now,
    updatedAt: now,
  };
  memoryDb.appointments.push(newAppointment);
  return newAppointment;
}

export async function updateAppointment(input: { appointmentId: number; patientId: number; clinicianId: number; startsAtMs: number; displayName?: string; reason: string }) {
  await ensureHmsSeed();
  const db = await getDb();
  const startsAt = new Date(input.startsAtMs); const endsAt = new Date(startsAt.getTime() + 30 * 60_000); const weekday = startsAt.getUTCDay();

  if (db) {
    return db.transaction(async (tx) => {
      const [existing] = await tx.select().from(appointments).where(and(eq(appointments.id, input.appointmentId), isNull(appointments.archivedAt))).limit(1);
      if (!existing) throw new Error("Appointment was not found.");
      const [patient] = await tx.select({ id: patients.id }).from(patients).where(and(eq(patients.id, input.patientId), isNull(patients.archivedAt))).limit(1);
      if (!patient) throw new Error("Choose a patient from the active registry.");
      const [clinicianWindows, scheduled] = await Promise.all([
        tx.select().from(availabilityWindows).where(and(eq(availabilityWindows.clinicianId, input.clinicianId), eq(availabilityWindows.weekday, weekday))),
        tx.select().from(appointments).where(and(eq(appointments.clinicianId, input.clinicianId), isNull(appointments.archivedAt), ne(appointments.id, input.appointmentId), ne(appointments.status, "Cancelled"), lt(appointments.startsAt, endsAt), gt(appointments.endsAt, startsAt))),
      ]);
      validateBookingRequest(startsAt, endsAt, clinicianWindows, scheduled);
      await tx.update(appointments).set({ patientId: input.patientId, clinicianId: input.clinicianId, startsAt, endsAt, displayName: input.displayName?.trim() || null, reason: input.reason.trim(), updatedAt: new Date() }).where(eq(appointments.id, input.appointmentId));
      return (await tx.select().from(appointments).where(eq(appointments.id, input.appointmentId)).limit(1))[0]!;
    });
  }

  initMemoryDb();
  const existing = memoryDb.appointments.find((a) => a.id === input.appointmentId && a.archivedAt === null);
  if (!existing) throw new Error("Appointment was not found.");
  const patient = memoryDb.patients.find((p) => p.id === input.patientId && p.archivedAt === null);
  if (!patient) throw new Error("Choose a patient from the active registry.");
  const clinicianWindows = memoryDb.availabilityWindows.filter((w) => w.clinicianId === input.clinicianId && w.weekday === weekday);
  const scheduled = memoryDb.appointments.filter(
    (a) => a.clinicianId === input.clinicianId && a.archivedAt === null && a.id !== input.appointmentId && a.status !== "Cancelled" && new Date(a.startsAt) < endsAt && new Date(a.endsAt) > startsAt
  );
  validateBookingRequest(startsAt, endsAt, clinicianWindows, scheduled);
  existing.patientId = input.patientId;
  existing.clinicianId = input.clinicianId;
  existing.startsAt = startsAt;
  existing.endsAt = endsAt;
  existing.displayName = input.displayName?.trim() || null;
  existing.reason = input.reason.trim();
  existing.updatedAt = new Date();
  return existing;
}

export async function archiveAppointment(input: { appointmentId: number; userId: number }) {
  await ensureHmsSeed();
  const db = await getDb();
  if (db) {
    return db.transaction(async (tx) => {
      const [appointment] = await tx.select().from(appointments).where(and(eq(appointments.id, input.appointmentId), isNull(appointments.archivedAt))).limit(1);
      if (!appointment) throw new Error("Appointment was not found.");
      if (appointment.status !== "Scheduled" && appointment.status !== "Cancelled") throw new Error("Only Scheduled or Cancelled appointments can be archived.");
      const [linkedBills, linkedNotes, linkedPrescriptions, linkedOrders] = await Promise.all([
        tx.select({ id: bills.id }).from(bills).where(eq(bills.appointmentId, input.appointmentId)).limit(1),
        tx.select({ id: clinicalNotes.id }).from(clinicalNotes).where(eq(clinicalNotes.appointmentId, input.appointmentId)).limit(1),
        tx.select({ id: prescriptions.id }).from(prescriptions).where(eq(prescriptions.appointmentId, input.appointmentId)).limit(1),
        tx.select({ id: laboratoryOrders.id }).from(laboratoryOrders).where(eq(laboratoryOrders.appointmentId, input.appointmentId)).limit(1),
      ]);
      if ([linkedBills, linkedNotes, linkedPrescriptions, linkedOrders].some((rows) => rows.length > 0)) throw new Error("This appointment has linked billing or clinical records and must remain active.");
      const archivedAt = new Date();
      await tx.update(appointments).set({ archivedAt, archivedByUserId: input.userId, updatedAt: new Date() }).where(eq(appointments.id, input.appointmentId));
      return { success: true, archivedAt } as const;
    });
  }

  initMemoryDb();
  const appointment = memoryDb.appointments.find((a) => a.id === input.appointmentId && a.archivedAt === null);
  if (!appointment) throw new Error("Appointment was not found.");
  if (appointment.status !== "Scheduled" && appointment.status !== "Cancelled") throw new Error("Only Scheduled or Cancelled appointments can be archived.");
  const hasLinkedBill = memoryDb.bills.some((b) => b.appointmentId === input.appointmentId);
  const hasLinkedNote = memoryDb.clinicalNotes.some((n) => n.appointmentId === input.appointmentId);
  const hasLinkedRx = memoryDb.prescriptions.some((p) => p.appointmentId === input.appointmentId);
  const hasLinkedLab = memoryDb.laboratoryOrders.some((l) => l.appointmentId === input.appointmentId);
  if (hasLinkedBill || hasLinkedNote || hasLinkedRx || hasLinkedLab) {
    throw new Error("This appointment has linked billing or clinical records and must remain active.");
  }
  const archivedAt = new Date();
  appointment.archivedAt = archivedAt;
  appointment.archivedByUserId = input.userId;
  return { success: true, archivedAt } as const;
}

export async function archivePatient(input: { patientId: number; userId: number }) {
  await ensureHmsSeed();
  const db = await getDb();
  if (db) {
    return db.transaction(async (tx) => {
      const [patient] = await tx.select().from(patients).where(and(eq(patients.id, input.patientId), isNull(patients.archivedAt))).limit(1);
      if (!patient) throw new Error("Patient was not found.");
      const [linkedAppointments, linkedBills, linkedNotes, linkedPrescriptions, linkedOrders] = await Promise.all([
        tx.select({ id: appointments.id }).from(appointments).where(and(eq(appointments.patientId, input.patientId), isNull(appointments.archivedAt))).limit(1),
        tx.select({ id: bills.id }).from(bills).where(eq(bills.patientId, input.patientId)).limit(1),
        tx.select({ id: clinicalNotes.id }).from(clinicalNotes).where(eq(clinicalNotes.patientId, input.patientId)).limit(1),
        tx.select({ id: prescriptions.id }).from(prescriptions).where(eq(prescriptions.patientId, input.patientId)).limit(1),
        tx.select({ id: laboratoryOrders.id }).from(laboratoryOrders).where(eq(laboratoryOrders.patientId, input.patientId)).limit(1),
      ]);
      if ([linkedAppointments, linkedBills, linkedNotes, linkedPrescriptions, linkedOrders].some((rows) => rows.length > 0)) throw new Error("This patient has linked scheduling, billing, or clinical records and must remain active.");
      const archivedAt = new Date();
      await tx.update(patients).set({ archivedAt, archivedByUserId: input.userId }).where(eq(patients.id, input.patientId));
      return { success: true, archivedAt } as const;
    });
  }

  initMemoryDb();
  const patient = memoryDb.patients.find((p) => p.id === input.patientId && p.archivedAt === null);
  if (!patient) throw new Error("Patient was not found.");
  const hasLinkedAppt = memoryDb.appointments.some((a) => a.patientId === input.patientId && a.archivedAt === null);
  const hasLinkedBill = memoryDb.bills.some((b) => b.patientId === input.patientId);
  const hasLinkedNote = memoryDb.clinicalNotes.some((n) => n.patientId === input.patientId);
  const hasLinkedRx = memoryDb.prescriptions.some((p) => p.patientId === input.patientId);
  const hasLinkedLab = memoryDb.laboratoryOrders.some((l) => l.patientId === input.patientId);
  if (hasLinkedAppt || hasLinkedBill || hasLinkedNote || hasLinkedRx || hasLinkedLab) {
    throw new Error("This patient has linked scheduling, billing, or clinical records and must remain active.");
  }
  const archivedAt = new Date();
  patient.archivedAt = archivedAt;
  patient.archivedByUserId = input.userId;
  return { success: true, archivedAt } as const;
}

export async function getArchivedRecords() {
  await ensureHmsSeed();
  const db = await getDb();
  if (db) {
    const [archivedPatients, archivedAppointments] = await Promise.all([
      db.select({ patient: patients, archivedBy: { id: users.id, name: users.name } }).from(patients).leftJoin(users, eq(patients.archivedByUserId, users.id)).where(isNotNull(patients.archivedAt)).orderBy(desc(patients.archivedAt)),
      db.select({ appointment: appointments, patient: patients, clinician: clinicians, archivedBy: { id: users.id, name: users.name } }).from(appointments).innerJoin(patients, eq(appointments.patientId, patients.id)).innerJoin(clinicians, eq(appointments.clinicianId, clinicians.id)).leftJoin(users, eq(appointments.archivedByUserId, users.id)).where(isNotNull(appointments.archivedAt)).orderBy(desc(appointments.archivedAt)),
    ]);
    return { patients: archivedPatients, appointments: archivedAppointments };
  }

  initMemoryDb();
  const archivedPatients = memoryDb.patients
    .filter((p) => p.archivedAt !== null)
    .map((patient) => {
      const archivedBy = patient.archivedByUserId ? memoryDb.users.find((u) => u.id === patient.archivedByUserId) || null : null;
      return { patient, archivedBy: archivedBy ? { id: archivedBy.id, name: archivedBy.name } : null };
    })
    .sort((a, b) => (b.patient.archivedAt ? new Date(b.patient.archivedAt).getTime() : 0) - (a.patient.archivedAt ? new Date(a.patient.archivedAt).getTime() : 0));

  const archivedAppointments = memoryDb.appointments
    .filter((a) => a.archivedAt !== null)
    .map((appointment) => {
      const patient = memoryDb.patients.find((p) => p.id === appointment.patientId);
      const clinician = memoryDb.clinicians.find((c) => c.id === appointment.clinicianId);
      const archivedBy = appointment.archivedByUserId ? memoryDb.users.find((u) => u.id === appointment.archivedByUserId) || null : null;
      if (!patient || !clinician) return null;
      return { appointment, patient, clinician, archivedBy: archivedBy ? { id: archivedBy.id, name: archivedBy.name } : null };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => (b.appointment.archivedAt ? new Date(b.appointment.archivedAt).getTime() : 0) - (a.appointment.archivedAt ? new Date(a.appointment.archivedAt).getTime() : 0));

  return { patients: archivedPatients, appointments: archivedAppointments };
}

export async function restorePatient(patientId: number) {
  const db = await getDb();
  if (db) {
    const [patient] = await db.select().from(patients).where(and(eq(patients.id, patientId), isNotNull(patients.archivedAt))).limit(1);
    if (!patient) throw new Error("Archived patient record was not found.");
    await db.update(patients).set({ archivedAt: null }).where(eq(patients.id, patientId));
    return { success: true } as const;
  }

  initMemoryDb();
  const patient = memoryDb.patients.find((p) => p.id === patientId && p.archivedAt !== null);
  if (!patient) throw new Error("Archived patient record was not found.");
  patient.archivedAt = null;
  return { success: true } as const;
}

export async function restoreAppointment(appointmentId: number) {
  await ensureHmsSeed();
  const db = await getDb();
  if (db) {
    return db.transaction(async (tx) => {
      const [appointment] = await tx.select().from(appointments).where(and(eq(appointments.id, appointmentId), isNotNull(appointments.archivedAt))).limit(1);
      if (!appointment) throw new Error("Archived appointment was not found.");
      const [patientRows, clinicianRows] = await Promise.all([
        tx.select({ id: patients.id }).from(patients).where(and(eq(patients.id, appointment.patientId), isNull(patients.archivedAt))).limit(1),
        tx.select().from(clinicians).where(and(eq(clinicians.id, appointment.clinicianId), eq(clinicians.isActive, "yes"))).limit(1),
      ]);
      const patient = patientRows[0];
      const clinician = clinicianRows[0];
      if (!patient) throw new Error("Restore the linked patient record before restoring this appointment.");
      if (!clinician) throw new Error("The appointment clinician is no longer active.");
      if (appointment.status !== "Cancelled") {
        const weekday = new Date(appointment.startsAt).getUTCDay();
        const [clinicianWindows, scheduled] = await Promise.all([
          tx.select().from(availabilityWindows).where(and(eq(availabilityWindows.clinicianId, appointment.clinicianId), eq(availabilityWindows.weekday, weekday))),
          tx.select().from(appointments).where(and(eq(appointments.clinicianId, appointment.clinicianId), isNull(appointments.archivedAt), ne(appointments.status, "Cancelled"), lt(appointments.startsAt, appointment.endsAt), gt(appointments.endsAt, appointment.startsAt))),
        ]);
        validateBookingRequest(new Date(appointment.startsAt), new Date(appointment.endsAt), clinicianWindows, scheduled);
      }
      await tx.update(appointments).set({ archivedAt: null, updatedAt: new Date() }).where(eq(appointments.id, appointmentId));
      return { success: true } as const;
    });
  }

  initMemoryDb();
  const appointment = memoryDb.appointments.find((a) => a.id === appointmentId && a.archivedAt !== null);
  if (!appointment) throw new Error("Archived appointment was not found.");
  const patient = memoryDb.patients.find((p) => p.id === appointment.patientId && p.archivedAt === null);
  if (!patient) throw new Error("Restore the linked patient record before restoring this appointment.");
  const clinician = memoryDb.clinicians.find((c) => c.id === appointment.clinicianId && c.isActive === "yes");
  if (!clinician) throw new Error("The appointment clinician is no longer active.");
  if (appointment.status !== "Cancelled") {
    const weekday = new Date(appointment.startsAt).getUTCDay();
    const clinicianWindows = memoryDb.availabilityWindows.filter((w) => w.clinicianId === appointment.clinicianId && w.weekday === weekday);
    const scheduled = memoryDb.appointments.filter(
      (a) => a.clinicianId === appointment.clinicianId && a.archivedAt === null && a.status !== "Cancelled" && new Date(a.startsAt) < new Date(appointment.endsAt) && new Date(a.endsAt) > new Date(appointment.startsAt)
    );
    validateBookingRequest(new Date(appointment.startsAt), new Date(appointment.endsAt), clinicianWindows, scheduled);
  }
  appointment.archivedAt = null;
  return { success: true } as const;
}

export async function updateAppointmentStatus(appointmentId: number, status: AppointmentStatus) {
  const db = await getDb();
  if (db) {
    await db.update(appointments).set({ status, updatedAt: new Date() }).where(and(eq(appointments.id, appointmentId), isNull(appointments.archivedAt)));
    return { success: true } as const;
  }
  initMemoryDb();
  const appointment = memoryDb.appointments.find((a) => a.id === appointmentId && a.archivedAt === null);
  if (appointment) appointment.status = status;
  return { success: true } as const;
}

export async function recordPayment(input: { billId: number; amount: number; method: PaymentMethod; userId: number }) {
  const db = await getDb();
  if (db) {
    await db.transaction(async (tx) => {
      await tx.insert(payments).values({ billId: input.billId, amount: input.amount.toFixed(2), method: input.method, recordedByUserId: input.userId });
      const billRecord = (await tx.select().from(bills).where(eq(bills.id, input.billId)).limit(1))[0]!;
      const billPayments = await tx.select().from(payments).where(eq(payments.billId, input.billId));
      const collected = billPayments.reduce((sum: number, payment: { amount: string }) => sum + Number(payment.amount), 0);
      await tx.update(bills).set({ status: collected >= Number(billRecord.totalAmount) ? "Paid" : collected > 0 ? "Partial" : "Due" }).where(eq(bills.id, input.billId));
    });
    return { success: true } as const;
  }

  initMemoryDb();
  const newPayment: PaymentRow = {
    id: memoryDb.nextId.payments++,
    billId: input.billId,
    amount: input.amount.toFixed(2),
    method: input.method,
    receivedAt: new Date(),
    recordedByUserId: input.userId,
  };
  memoryDb.payments.push(newPayment);
  const bill = memoryDb.bills.find((b) => b.id === input.billId);
  if (bill) {
    const totalCollected = memoryDb.payments.filter((p) => p.billId === input.billId).reduce((sum, p) => sum + Number(p.amount), 0);
    bill.status = totalCollected >= Number(bill.totalAmount) ? "Paid" : totalCollected > 0 ? "Partial" : "Due";
  }
  return { success: true } as const;
}

export async function getRoleContext(userId: number) {
  const db = await getDb();
  if (db) {
    const user = (await db.select().from(users).where(eq(users.id, userId)).limit(1))[0];
    if (!user) throw new Error("Active user was not found.");
    const clinician = (await db.select().from(clinicians).where(eq(clinicians.userId, userId)).limit(1))[0] ?? null;
    return { role: user.role as HmsRole, clinician };
  }

  initMemoryDb();
  const user = memoryDb.users.find((u) => u.id === userId);
  if (!user) throw new Error("Active user was not found.");
  const clinician = memoryDb.clinicians.find((c) => c.userId === userId) ?? null;
  return { role: user.role as HmsRole, clinician };
}

async function resolveAuthorClinician(input: { userId: number; role: HmsRole; clinicianId?: number }) {
  const db = await getDb();
  if (db) {
    if (input.role === "doctor") {
      const linked = (await db.select().from(clinicians).where(eq(clinicians.userId, input.userId)).limit(1))[0];
      if (!linked) throw new Error("This doctor account is not linked to a clinician profile. Ask an administrator to assign the profile.");
      return linked;
    }
    if (!input.clinicianId) throw new Error("An administrator must select the responsible clinician.");
    const selected = (await db.select().from(clinicians).where(eq(clinicians.id, input.clinicianId)).limit(1))[0];
    if (!selected) throw new Error("The selected clinician was not found.");
    return selected;
  }

  initMemoryDb();
  if (input.role === "doctor") {
    const linked = memoryDb.clinicians.find((c) => c.userId === input.userId);
    if (!linked) throw new Error("This doctor account is not linked to a clinician profile. Ask an administrator to assign the profile.");
    return linked;
  }
  if (!input.clinicianId) throw new Error("An administrator must select the responsible clinician.");
  const selected = memoryDb.clinicians.find((c) => c.id === input.clinicianId);
  if (!selected) throw new Error("The selected clinician was not found.");
  return selected;
}

export async function getPatientMedicalRecord(patientId: number) {
  await ensureMedicalRecordSeed();
  const db = await getDb();
  if (db) {
    const patient = (await db.select().from(patients).where(eq(patients.id, patientId)).limit(1))[0];
    if (!patient) throw new Error("Patient record not found.");
    const [notes, prescriptionRows, itemRows, labRows] = await Promise.all([
      db.select({ note: clinicalNotes, clinician: clinicians }).from(clinicalNotes).innerJoin(clinicians, eq(clinicalNotes.authorClinicianId, clinicians.id)).where(eq(clinicalNotes.patientId, patientId)).orderBy(desc(clinicalNotes.createdAt)),
      db.select({ prescription: prescriptions, clinician: clinicians }).from(prescriptions).innerJoin(clinicians, eq(prescriptions.prescriberClinicianId, clinicians.id)).where(eq(prescriptions.patientId, patientId)).orderBy(desc(prescriptions.prescribedAt)),
      db.select().from(prescriptionItems),
      db.select({ order: laboratoryOrders, orderingClinician: clinicians, result: laboratoryResults }).from(laboratoryOrders).innerJoin(clinicians, eq(laboratoryOrders.orderingClinicianId, clinicians.id)).leftJoin(laboratoryResults, eq(laboratoryResults.laboratoryOrderId, laboratoryOrders.id)).where(eq(laboratoryOrders.patientId, patientId)).orderBy(desc(laboratoryOrders.orderedAt)),
    ]);
    const rxIds = prescriptionRows.map((row) => row.prescription.id);
    const scopedItems = rxIds.length ? itemRows.filter((item) => rxIds.includes(item.prescriptionId)) : [];
    return { patient, notes, prescriptions: prescriptionRows.map((row) => ({ ...row, items: scopedItems.filter((item) => item.prescriptionId === row.prescription.id) })), laboratoryOrders: labRows };
  }

  initMemoryDb();
  const patient = memoryDb.patients.find((p) => p.id === patientId);
  if (!patient) throw new Error("Patient record not found.");
  const notes = memoryDb.clinicalNotes
    .filter((n) => n.patientId === patientId)
    .map((note) => {
      const clinician = memoryDb.clinicians.find((c) => c.id === note.authorClinicianId)!;
      return { note, clinician };
    })
    .sort((a, b) => new Date(b.note.createdAt).getTime() - new Date(a.note.createdAt).getTime());

  const rxList = memoryDb.prescriptions
    .filter((p) => p.patientId === patientId)
    .map((prescription) => {
      const clinician = memoryDb.clinicians.find((c) => c.id === prescription.prescriberClinicianId)!;
      const items = memoryDb.prescriptionItems.filter((item) => item.prescriptionId === prescription.id);
      return { prescription, clinician, items };
    })
    .sort((a, b) => new Date(b.prescription.prescribedAt).getTime() - new Date(a.prescription.prescribedAt).getTime());

  const labRows = memoryDb.laboratoryOrders
    .filter((l) => l.patientId === patientId)
    .map((order) => {
      const orderingClinician = memoryDb.clinicians.find((c) => c.id === order.orderingClinicianId)!;
      const result = memoryDb.laboratoryResults.find((r) => r.laboratoryOrderId === order.id) || null;
      return { order, orderingClinician, result };
    })
    .sort((a, b) => new Date(b.order.orderedAt).getTime() - new Date(a.order.orderedAt).getTime());

  return { patient, notes, prescriptions: rxList, laboratoryOrders: labRows };
}

export async function createClinicalNote(input: { patientId: number; appointmentId?: number; clinicianId?: number; subjective: string; assessment: string; plan: string; userId: number; role: HmsRole }) {
  const author = await resolveAuthorClinician(input);
  const db = await getDb();
  if (db) {
    await db.insert(clinicalNotes).values({ patientId: input.patientId, appointmentId: input.appointmentId, authorClinicianId: author.id, authorUserId: input.userId, subjective: input.subjective, assessment: input.assessment, plan: input.plan });
    return { success: true } as const;
  }

  initMemoryDb();
  const now = new Date();
  memoryDb.clinicalNotes.push({
    id: memoryDb.nextId.clinicalNotes++,
    patientId: input.patientId,
    appointmentId: input.appointmentId ?? null,
    authorClinicianId: author.id,
    authorUserId: input.userId,
    subjective: input.subjective,
    assessment: input.assessment,
    plan: input.plan,
    createdAt: now,
    updatedAt: now,
  });
  return { success: true } as const;
}

export async function createPrescription(input: { patientId: number; appointmentId?: number; clinicianId?: number; notes?: string; items: { medicineName: string; dosage: string; route: string; frequency: string; durationDays?: number; instructions?: string }[]; userId: number; role: HmsRole }) {
  const prescriber = await resolveAuthorClinician(input); const code = `RX-${String(Date.now()).slice(-7)}`;
  const db = await getDb();
  if (db) {
    await db.transaction(async (tx) => {
      await tx.insert(prescriptions).values({ prescriptionCode: code, patientId: input.patientId, appointmentId: input.appointmentId, prescriberClinicianId: prescriber.id, authorUserId: input.userId, notes: input.notes });
      const rx = (await tx.select().from(prescriptions).where(eq(prescriptions.prescriptionCode, code)).limit(1))[0]!;
      await tx.insert(prescriptionItems).values(input.items.map((item) => ({ prescriptionId: rx.id, ...item, durationDays: item.durationDays ?? null, instructions: item.instructions ?? null })));
    });
    return { success: true } as const;
  }

  initMemoryDb();
  const rxId = memoryDb.nextId.prescriptions++;
  memoryDb.prescriptions.push({
    id: rxId,
    prescriptionCode: code,
    patientId: input.patientId,
    appointmentId: input.appointmentId ?? null,
    prescriberClinicianId: prescriber.id,
    authorUserId: input.userId,
    notes: input.notes ?? null,
    status: "Active",
    prescribedAt: new Date(),
  });
  for (const item of input.items) {
    memoryDb.prescriptionItems.push({
      id: memoryDb.nextId.prescriptionItems++,
      prescriptionId: rxId,
      medicineName: item.medicineName,
      dosage: item.dosage,
      route: item.route || "Oral",
      frequency: item.frequency,
      durationDays: item.durationDays ?? null,
      instructions: item.instructions ?? null,
    });
  }
  return { success: true } as const;
}

export async function createLaboratoryOrder(input: { patientId: number; appointmentId?: number; clinicianId?: number; testName: string; priority: "Routine" | "Urgent"; clinicalQuestion?: string; userId: number; role: HmsRole }) {
  const clinician = await resolveAuthorClinician(input); const code = `LAB-${String(Date.now()).slice(-7)}`;
  const db = await getDb();
  if (db) {
    await db.insert(laboratoryOrders).values({ orderCode: code, patientId: input.patientId, appointmentId: input.appointmentId, orderingClinicianId: clinician.id, authorUserId: input.userId, testName: input.testName, priority: input.priority, clinicalQuestion: input.clinicalQuestion });
    return { success: true } as const;
  }

  initMemoryDb();
  memoryDb.laboratoryOrders.push({
    id: memoryDb.nextId.laboratoryOrders++,
    orderCode: code,
    patientId: input.patientId,
    appointmentId: input.appointmentId ?? null,
    orderingClinicianId: clinician.id,
    authorUserId: input.userId,
    testName: input.testName,
    priority: input.priority,
    status: "Ordered",
    clinicalQuestion: input.clinicalQuestion ?? null,
    orderedAt: new Date(),
  });
  return { success: true } as const;
}

export async function recordLaboratoryResult(input: { laboratoryOrderId: number; resultSummary: string; resultValue?: string; referenceRange?: string; clinicianId?: number; userId: number; role: HmsRole }) {
  const clinician = await resolveAuthorClinician(input);
  const db = await getDb();
  if (db) {
    await db.transaction(async (tx) => {
      await tx.insert(laboratoryResults).values({ laboratoryOrderId: input.laboratoryOrderId, reportedByClinicianId: clinician.id, resultSummary: input.resultSummary, resultValue: input.resultValue, referenceRange: input.referenceRange });
      await tx.update(laboratoryOrders).set({ status: "Resulted" }).where(eq(laboratoryOrders.id, input.laboratoryOrderId));
    });
    return { success: true } as const;
  }

  initMemoryDb();
  memoryDb.laboratoryResults.push({
    id: memoryDb.nextId.laboratoryResults++,
    laboratoryOrderId: input.laboratoryOrderId,
    reportedByClinicianId: clinician.id,
    resultSummary: input.resultSummary,
    resultValue: input.resultValue ?? null,
    referenceRange: input.referenceRange ?? null,
    reportedAt: new Date(),
  });
  const order = memoryDb.laboratoryOrders.find((o) => o.id === input.laboratoryOrderId);
  if (order) order.status = "Resulted";
  return { success: true } as const;
}

export async function listStaff() {
  return listManagedAccounts();
}

export async function updateStaffRole(input: { userId: number; role: HmsRole; clinicianId?: number }) {
  const db = await getDb();
  if (db) {
    await db.transaction(async (tx) => {
      await tx.update(users).set({ role: input.role, updatedAt: new Date() }).where(eq(users.id, input.userId));
      if (input.clinicianId) await tx.update(clinicians).set({ userId: input.userId }).where(eq(clinicians.id, input.clinicianId));
    });
    return { success: true } as const;
  }

  initMemoryDb();
  const user = memoryDb.users.find((u) => u.id === input.userId);
  if (user) user.role = input.role;
  if (input.clinicianId) {
    const clinician = memoryDb.clinicians.find((c) => c.id === input.clinicianId);
    if (clinician) clinician.userId = input.userId;
  }
  return { success: true } as const;
}
