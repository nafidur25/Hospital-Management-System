import {
  date,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

// ─── Enums ────────────────────────────────────────────────────────────────────
export const hmsRoleEnum = pgEnum("hms_role", ["admin", "doctor", "receptionist"]);
export const isActiveEnum = pgEnum("hms_is_active", ["yes", "no"]);
export const genderEnum = pgEnum("hms_gender", ["Female", "Male", "Other", "Not specified"]);
export const appointmentStatusEnum = pgEnum("hms_appointment_status", ["Scheduled", "Checked in", "Completed", "Cancelled"]);
export const billStatusEnum = pgEnum("hms_bill_status", ["Paid", "Partial", "Due", "Cancelled"]);
export const paymentMethodEnum = pgEnum("hms_payment_method", ["Cash", "Card", "Mobile banking", "Insurance"]);
export const prescriptionStatusEnum = pgEnum("hms_prescription_status", ["Active", "Completed", "Cancelled"]);
export const labPriorityEnum = pgEnum("hms_lab_priority", ["Routine", "Urgent"]);
export const labStatusEnum = pgEnum("hms_lab_status", ["Ordered", "Collected", "Resulted", "Cancelled"]);

// ─── Tables ───────────────────────────────────────────────────────────────────

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  passwordHash: varchar("password_hash", { length: 200 }),
  role: hmsRoleEnum("role").default("receptionist").notNull(),
  isActive: isActiveEnum("is_active").default("yes").notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [uniqueIndex("users_email_uq").on(table.email)]);

export const clinicians = pgTable("hms_clinicians", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
  fullName: varchar("full_name", { length: 140 }).notNull(),
  specialty: varchar("specialty", { length: 120 }).notNull(),
  department: varchar("department", { length: 120 }).notNull(),
  color: varchar("color", { length: 16 }).notNull().default("#007C83"),
  isActive: isActiveEnum("is_active").default("yes").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [uniqueIndex("hms_clinicians_user_uq").on(table.userId)]);

export const patients = pgTable("hms_patients", {
  id: serial("id").primaryKey(),
  patientCode: varchar("patient_code", { length: 24 }).notNull(),
  fullName: varchar("full_name", { length: 140 }).notNull(),
  dateOfBirth: date("date_of_birth"),
  gender: genderEnum("gender").default("Not specified").notNull(),
  phone: varchar("phone", { length: 32 }).notNull(),
  email: varchar("email", { length: 320 }),
  careContext: varchar("care_context", { length: 240 }).notNull().default("Initial assessment"),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  archivedByUserId: integer("archived_by_user_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("hms_patients_code_uq").on(table.patientCode),
  uniqueIndex("hms_patients_phone_uq").on(table.phone),
  index("hms_patients_archived_idx").on(table.archivedAt),
]);

export const availabilityWindows = pgTable("hms_availability_windows", {
  id: serial("id").primaryKey(),
  clinicianId: integer("clinician_id").notNull().references(() => clinicians.id, { onDelete: "cascade" }),
  weekday: integer("weekday").notNull(),
  startMinute: integer("start_minute").notNull(),
  endMinute: integer("end_minute").notNull(),
  slotMinutes: integer("slot_minutes").notNull().default(30),
}, (table) => [index("hms_availability_clinician_day_idx").on(table.clinicianId, table.weekday)]);

export const appointments = pgTable("hms_appointments", {
  id: serial("id").primaryKey(),
  appointmentCode: varchar("appointment_code", { length: 28 }).notNull(),
  patientId: integer("patient_id").notNull().references(() => patients.id, { onDelete: "restrict" }),
  clinicianId: integer("clinician_id").notNull().references(() => clinicians.id, { onDelete: "restrict" }),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  displayName: varchar("display_name", { length: 140 }),
  reason: varchar("reason", { length: 240 }).notNull(),
  status: appointmentStatusEnum("status").default("Scheduled").notNull(),
  createdByUserId: integer("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  archivedByUserId: integer("archived_by_user_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("hms_appointments_code_uq").on(table.appointmentCode),
  index("hms_appointments_clinician_time_idx").on(table.clinicianId, table.startsAt),
  index("hms_appointments_patient_time_idx").on(table.patientId, table.startsAt),
  index("hms_appointments_archived_idx").on(table.archivedAt),
]);

export const bills = pgTable("hms_bills", {
  id: serial("id").primaryKey(),
  billCode: varchar("bill_code", { length: 28 }).notNull(),
  patientId: integer("patient_id").notNull().references(() => patients.id, { onDelete: "restrict" }),
  appointmentId: integer("appointment_id").references(() => appointments.id, { onDelete: "set null" }),
  totalAmount: numeric("total_amount", { precision: 10, scale: 2 }).notNull(),
  status: billStatusEnum("status").default("Due").notNull(),
  issuedAt: timestamp("issued_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [uniqueIndex("hms_bills_code_uq").on(table.billCode)]);

export const payments = pgTable("hms_payments", {
  id: serial("id").primaryKey(),
  billId: integer("bill_id").notNull().references(() => bills.id, { onDelete: "cascade" }),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  method: paymentMethodEnum("method").default("Cash").notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).defaultNow().notNull(),
  recordedByUserId: integer("recorded_by_user_id").references(() => users.id, { onDelete: "set null" }),
});

export const clinicalNotes = pgTable("hms_clinical_notes", {
  id: serial("id").primaryKey(),
  patientId: integer("patient_id").notNull().references(() => patients.id, { onDelete: "cascade" }),
  appointmentId: integer("appointment_id").references(() => appointments.id, { onDelete: "set null" }),
  authorClinicianId: integer("author_clinician_id").notNull().references(() => clinicians.id, { onDelete: "restrict" }),
  authorUserId: integer("author_user_id").references(() => users.id, { onDelete: "set null" }),
  subjective: text("subjective").notNull(),
  assessment: text("assessment").notNull(),
  plan: text("plan").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index("hms_clinical_notes_patient_idx").on(table.patientId, table.createdAt)]);

export const prescriptions = pgTable("hms_prescriptions", {
  id: serial("id").primaryKey(),
  prescriptionCode: varchar("prescription_code", { length: 28 }).notNull(),
  patientId: integer("patient_id").notNull().references(() => patients.id, { onDelete: "cascade" }),
  appointmentId: integer("appointment_id").references(() => appointments.id, { onDelete: "set null" }),
  prescriberClinicianId: integer("prescriber_clinician_id").notNull().references(() => clinicians.id, { onDelete: "restrict" }),
  authorUserId: integer("author_user_id").references(() => users.id, { onDelete: "set null" }),
  notes: text("notes"),
  status: prescriptionStatusEnum("status").default("Active").notNull(),
  prescribedAt: timestamp("prescribed_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("hms_prescriptions_code_uq").on(table.prescriptionCode),
  index("hms_prescriptions_patient_idx").on(table.patientId, table.prescribedAt),
]);

export const prescriptionItems = pgTable("hms_prescription_items", {
  id: serial("id").primaryKey(),
  prescriptionId: integer("prescription_id").notNull().references(() => prescriptions.id, { onDelete: "cascade" }),
  medicineName: varchar("medicine_name", { length: 160 }).notNull(),
  dosage: varchar("dosage", { length: 120 }).notNull(),
  route: varchar("route", { length: 80 }).notNull().default("Oral"),
  frequency: varchar("frequency", { length: 120 }).notNull(),
  durationDays: integer("duration_days"),
  instructions: text("instructions"),
}, (table) => [index("hms_prescription_items_rx_idx").on(table.prescriptionId)]);

export const laboratoryOrders = pgTable("hms_laboratory_orders", {
  id: serial("id").primaryKey(),
  orderCode: varchar("order_code", { length: 28 }).notNull(),
  patientId: integer("patient_id").notNull().references(() => patients.id, { onDelete: "cascade" }),
  appointmentId: integer("appointment_id").references(() => appointments.id, { onDelete: "set null" }),
  orderingClinicianId: integer("ordering_clinician_id").notNull().references(() => clinicians.id, { onDelete: "restrict" }),
  authorUserId: integer("author_user_id").references(() => users.id, { onDelete: "set null" }),
  testName: varchar("test_name", { length: 180 }).notNull(),
  priority: labPriorityEnum("priority").default("Routine").notNull(),
  status: labStatusEnum("status").default("Ordered").notNull(),
  clinicalQuestion: text("clinical_question"),
  orderedAt: timestamp("ordered_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("hms_laboratory_orders_code_uq").on(table.orderCode),
  index("hms_lab_orders_patient_idx").on(table.patientId, table.orderedAt),
]);

export const laboratoryResults = pgTable("hms_laboratory_results", {
  id: serial("id").primaryKey(),
  laboratoryOrderId: integer("laboratory_order_id").notNull().references(() => laboratoryOrders.id, { onDelete: "cascade" }),
  reportedByClinicianId: integer("reported_by_clinician_id").references(() => clinicians.id, { onDelete: "set null" }),
  resultSummary: text("result_summary").notNull(),
  referenceRange: varchar("reference_range", { length: 160 }),
  resultValue: varchar("result_value", { length: 160 }),
  reportedAt: timestamp("reported_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [uniqueIndex("hms_lab_results_order_uq").on(table.laboratoryOrderId)]);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Clinician = typeof clinicians.$inferSelect;
export type Patient = typeof patients.$inferSelect;
export type Appointment = typeof appointments.$inferSelect;
export type ClinicalNote = typeof clinicalNotes.$inferSelect;
export type Prescription = typeof prescriptions.$inferSelect;
export type LaboratoryOrder = typeof laboratoryOrders.$inferSelect;
