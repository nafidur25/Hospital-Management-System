import {
  date,
  decimal,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  passwordHash: varchar("password_hash", { length: 200 }),
  role: mysqlEnum("role", ["admin", "doctor", "receptionist"]).default("receptionist").notNull(),
  isActive: mysqlEnum("is_active", ["yes", "no"]).default("yes").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
}, (table) => [uniqueIndex("users_email_uq").on(table.email)]);

export const clinicians = mysqlTable("hms_clinicians", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").references(() => users.id, { onDelete: "set null" }),
  fullName: varchar("full_name", { length: 140 }).notNull(),
  specialty: varchar("specialty", { length: 120 }).notNull(),
  department: varchar("department", { length: 120 }).notNull(),
  color: varchar("color", { length: 16 }).notNull().default("#007C83"),
  isActive: mysqlEnum("is_active", ["yes", "no"]).default("yes").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [uniqueIndex("hms_clinicians_user_uq").on(table.userId)]);

export const patients = mysqlTable("hms_patients", {
  id: int("id").autoincrement().primaryKey(),
  patientCode: varchar("patient_code", { length: 24 }).notNull(),
  fullName: varchar("full_name", { length: 140 }).notNull(),
  dateOfBirth: date("date_of_birth"),
  gender: mysqlEnum("gender", ["Female", "Male", "Other", "Not specified"]).default("Not specified").notNull(),
  phone: varchar("phone", { length: 32 }).notNull(),
  email: varchar("email", { length: 320 }),
  careContext: varchar("care_context", { length: 240 }).notNull().default("Initial assessment"),
  archivedAt: timestamp("archived_at"),
  archivedByUserId: int("archived_by_user_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("hms_patients_code_uq").on(table.patientCode),
  uniqueIndex("hms_patients_phone_uq").on(table.phone),
  index("hms_patients_archived_idx").on(table.archivedAt),
]);

export const availabilityWindows = mysqlTable("hms_availability_windows", {
  id: int("id").autoincrement().primaryKey(),
  clinicianId: int("clinician_id").notNull().references(() => clinicians.id, { onDelete: "cascade" }),
  weekday: int("weekday").notNull(),
  startMinute: int("start_minute").notNull(),
  endMinute: int("end_minute").notNull(),
  slotMinutes: int("slot_minutes").notNull().default(30),
}, (table) => [index("hms_availability_clinician_day_idx").on(table.clinicianId, table.weekday)]);

export const appointments = mysqlTable("hms_appointments", {
  id: int("id").autoincrement().primaryKey(),
  appointmentCode: varchar("appointment_code", { length: 28 }).notNull(),
  patientId: int("patient_id").notNull().references(() => patients.id, { onDelete: "restrict" }),
  clinicianId: int("clinician_id").notNull().references(() => clinicians.id, { onDelete: "restrict" }),
  startsAt: timestamp("starts_at").notNull(),
  endsAt: timestamp("ends_at").notNull(),
  displayName: varchar("display_name", { length: 140 }),
  reason: varchar("reason", { length: 240 }).notNull(),
  status: mysqlEnum("status", ["Scheduled", "Checked in", "Completed", "Cancelled"]).default("Scheduled").notNull(),
  createdByUserId: int("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
  archivedAt: timestamp("archived_at"),
  archivedByUserId: int("archived_by_user_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  uniqueIndex("hms_appointments_code_uq").on(table.appointmentCode),
  index("hms_appointments_clinician_time_idx").on(table.clinicianId, table.startsAt),
  index("hms_appointments_patient_time_idx").on(table.patientId, table.startsAt),
  index("hms_appointments_archived_idx").on(table.archivedAt),
]);

export const bills = mysqlTable("hms_bills", {
  id: int("id").autoincrement().primaryKey(),
  billCode: varchar("bill_code", { length: 28 }).notNull(),
  patientId: int("patient_id").notNull().references(() => patients.id, { onDelete: "restrict" }),
  appointmentId: int("appointment_id").references(() => appointments.id, { onDelete: "set null" }),
  totalAmount: decimal("total_amount", { precision: 10, scale: 2 }).notNull(),
  status: mysqlEnum("status", ["Paid", "Partial", "Due", "Cancelled"]).default("Due").notNull(),
  issuedAt: timestamp("issued_at").defaultNow().notNull(),
}, (table) => [uniqueIndex("hms_bills_code_uq").on(table.billCode)]);

export const payments = mysqlTable("hms_payments", {
  id: int("id").autoincrement().primaryKey(),
  billId: int("bill_id").notNull().references(() => bills.id, { onDelete: "cascade" }),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  method: mysqlEnum("method", ["Cash", "Card", "Mobile banking", "Insurance"]).default("Cash").notNull(),
  receivedAt: timestamp("received_at").defaultNow().notNull(),
  recordedByUserId: int("recorded_by_user_id").references(() => users.id, { onDelete: "set null" }),
});

export const clinicalNotes = mysqlTable("hms_clinical_notes", {
  id: int("id").autoincrement().primaryKey(),
  patientId: int("patient_id").notNull().references(() => patients.id, { onDelete: "cascade" }),
  appointmentId: int("appointment_id").references(() => appointments.id, { onDelete: "set null" }),
  authorClinicianId: int("author_clinician_id").notNull().references(() => clinicians.id, { onDelete: "restrict" }),
  authorUserId: int("author_user_id").references(() => users.id, { onDelete: "set null" }),
  subjective: text("subjective").notNull(),
  assessment: text("assessment").notNull(),
  plan: text("plan").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (table) => [index("hms_clinical_notes_patient_idx").on(table.patientId, table.createdAt)]);

export const prescriptions = mysqlTable("hms_prescriptions", {
  id: int("id").autoincrement().primaryKey(),
  prescriptionCode: varchar("prescription_code", { length: 28 }).notNull(),
  patientId: int("patient_id").notNull().references(() => patients.id, { onDelete: "cascade" }),
  appointmentId: int("appointment_id").references(() => appointments.id, { onDelete: "set null" }),
  prescriberClinicianId: int("prescriber_clinician_id").notNull().references(() => clinicians.id, { onDelete: "restrict" }),
  authorUserId: int("author_user_id").references(() => users.id, { onDelete: "set null" }),
  notes: text("notes"),
  status: mysqlEnum("status", ["Active", "Completed", "Cancelled"]).default("Active").notNull(),
  prescribedAt: timestamp("prescribed_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("hms_prescriptions_code_uq").on(table.prescriptionCode),
  index("hms_prescriptions_patient_idx").on(table.patientId, table.prescribedAt),
]);

export const prescriptionItems = mysqlTable("hms_prescription_items", {
  id: int("id").autoincrement().primaryKey(),
  prescriptionId: int("prescription_id").notNull().references(() => prescriptions.id, { onDelete: "cascade" }),
  medicineName: varchar("medicine_name", { length: 160 }).notNull(),
  dosage: varchar("dosage", { length: 120 }).notNull(),
  route: varchar("route", { length: 80 }).notNull().default("Oral"),
  frequency: varchar("frequency", { length: 120 }).notNull(),
  durationDays: int("duration_days"),
  instructions: text("instructions"),
}, (table) => [index("hms_prescription_items_rx_idx").on(table.prescriptionId)]);

export const laboratoryOrders = mysqlTable("hms_laboratory_orders", {
  id: int("id").autoincrement().primaryKey(),
  orderCode: varchar("order_code", { length: 28 }).notNull(),
  patientId: int("patient_id").notNull().references(() => patients.id, { onDelete: "cascade" }),
  appointmentId: int("appointment_id").references(() => appointments.id, { onDelete: "set null" }),
  orderingClinicianId: int("ordering_clinician_id").notNull().references(() => clinicians.id, { onDelete: "restrict" }),
  authorUserId: int("author_user_id").references(() => users.id, { onDelete: "set null" }),
  testName: varchar("test_name", { length: 180 }).notNull(),
  priority: mysqlEnum("priority", ["Routine", "Urgent"]).default("Routine").notNull(),
  status: mysqlEnum("status", ["Ordered", "Collected", "Resulted", "Cancelled"]).default("Ordered").notNull(),
  clinicalQuestion: text("clinical_question"),
  orderedAt: timestamp("ordered_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("hms_laboratory_orders_code_uq").on(table.orderCode),
  index("hms_lab_orders_patient_idx").on(table.patientId, table.orderedAt),
]);

export const laboratoryResults = mysqlTable("hms_laboratory_results", {
  id: int("id").autoincrement().primaryKey(),
  laboratoryOrderId: int("laboratory_order_id").notNull().references(() => laboratoryOrders.id, { onDelete: "cascade" }),
  reportedByClinicianId: int("reported_by_clinician_id").references(() => clinicians.id, { onDelete: "set null" }),
  resultSummary: text("result_summary").notNull(),
  referenceRange: varchar("reference_range", { length: 160 }),
  resultValue: varchar("result_value", { length: 160 }),
  reportedAt: timestamp("reported_at").defaultNow().notNull(),
}, (table) => [uniqueIndex("hms_lab_results_order_uq").on(table.laboratoryOrderId)]);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Clinician = typeof clinicians.$inferSelect;
export type Patient = typeof patients.$inferSelect;
export type Appointment = typeof appointments.$inferSelect;
export type ClinicalNote = typeof clinicalNotes.$inferSelect;
export type Prescription = typeof prescriptions.$inferSelect;
export type LaboratoryOrder = typeof laboratoryOrders.$inferSelect;
