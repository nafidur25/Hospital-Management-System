-- ============================================================
-- Clinical Ledger HMS — Supabase PostgreSQL Setup
-- Paste this entire file into the Supabase SQL Editor and Run.
-- ============================================================

-- ─── Enums ───────────────────────────────────────────────────────────────────

CREATE TYPE hms_role              AS ENUM ('admin', 'doctor', 'receptionist');
CREATE TYPE hms_is_active         AS ENUM ('yes', 'no');
CREATE TYPE hms_gender            AS ENUM ('Female', 'Male', 'Other', 'Not specified');
CREATE TYPE hms_appointment_status AS ENUM ('Scheduled', 'Checked in', 'Completed', 'Cancelled');
CREATE TYPE hms_bill_status       AS ENUM ('Paid', 'Partial', 'Due', 'Cancelled');
CREATE TYPE hms_payment_method    AS ENUM ('Cash', 'Card', 'Mobile banking', 'Insurance');
CREATE TYPE hms_prescription_status AS ENUM ('Active', 'Completed', 'Cancelled');
CREATE TYPE hms_lab_priority      AS ENUM ('Routine', 'Urgent');
CREATE TYPE hms_lab_status        AS ENUM ('Ordered', 'Collected', 'Resulted', 'Cancelled');

-- ─── Tables ──────────────────────────────────────────────────────────────────

CREATE TABLE users (
  id            SERIAL PRIMARY KEY,
  "openId"      VARCHAR(64)  NOT NULL UNIQUE,
  name          TEXT,
  email         VARCHAR(320),
  "loginMethod" VARCHAR(64),
  password_hash VARCHAR(200),
  role          hms_role     NOT NULL DEFAULT 'receptionist',
  is_active     hms_is_active NOT NULL DEFAULT 'yes',
  "createdAt"   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  "updatedAt"   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  "lastSignedIn" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX users_email_uq ON users (email);

CREATE TABLE hms_clinicians (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  full_name   VARCHAR(140) NOT NULL,
  specialty   VARCHAR(120) NOT NULL,
  department  VARCHAR(120) NOT NULL,
  color       VARCHAR(16)  NOT NULL DEFAULT '#007C83',
  is_active   hms_is_active NOT NULL DEFAULT 'yes',
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX hms_clinicians_user_uq ON hms_clinicians (user_id);

CREATE TABLE hms_patients (
  id                  SERIAL PRIMARY KEY,
  patient_code        VARCHAR(24)  NOT NULL,
  full_name           VARCHAR(140) NOT NULL,
  date_of_birth       DATE,
  gender              hms_gender   NOT NULL DEFAULT 'Not specified',
  phone               VARCHAR(32)  NOT NULL,
  email               VARCHAR(320),
  care_context        VARCHAR(240) NOT NULL DEFAULT 'Initial assessment',
  archived_at         TIMESTAMPTZ,
  archived_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX hms_patients_code_uq     ON hms_patients (patient_code);
CREATE UNIQUE INDEX hms_patients_phone_uq    ON hms_patients (phone);
CREATE        INDEX hms_patients_archived_idx ON hms_patients (archived_at);

CREATE TABLE hms_availability_windows (
  id           SERIAL PRIMARY KEY,
  clinician_id INTEGER NOT NULL REFERENCES hms_clinicians(id) ON DELETE CASCADE,
  weekday      INTEGER NOT NULL,
  start_minute INTEGER NOT NULL,
  end_minute   INTEGER NOT NULL,
  slot_minutes INTEGER NOT NULL DEFAULT 30
);
CREATE INDEX hms_availability_clinician_day_idx ON hms_availability_windows (clinician_id, weekday);

CREATE TABLE hms_appointments (
  id                   SERIAL PRIMARY KEY,
  appointment_code     VARCHAR(28)  NOT NULL,
  patient_id           INTEGER      NOT NULL REFERENCES hms_patients(id)   ON DELETE RESTRICT,
  clinician_id         INTEGER      NOT NULL REFERENCES hms_clinicians(id)  ON DELETE RESTRICT,
  starts_at            TIMESTAMPTZ  NOT NULL,
  ends_at              TIMESTAMPTZ  NOT NULL,
  display_name         VARCHAR(140),
  reason               VARCHAR(240) NOT NULL,
  status               hms_appointment_status NOT NULL DEFAULT 'Scheduled',
  created_by_user_id   INTEGER      REFERENCES users(id) ON DELETE SET NULL,
  archived_at          TIMESTAMPTZ,
  archived_by_user_id  INTEGER      REFERENCES users(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX hms_appointments_code_uq          ON hms_appointments (appointment_code);
CREATE        INDEX hms_appointments_clinician_time_idx ON hms_appointments (clinician_id, starts_at);
CREATE        INDEX hms_appointments_patient_time_idx   ON hms_appointments (patient_id,   starts_at);
CREATE        INDEX hms_appointments_archived_idx       ON hms_appointments (archived_at);

CREATE TABLE hms_bills (
  id             SERIAL PRIMARY KEY,
  bill_code      VARCHAR(28)  NOT NULL,
  patient_id     INTEGER      NOT NULL REFERENCES hms_patients(id)      ON DELETE RESTRICT,
  appointment_id INTEGER               REFERENCES hms_appointments(id)  ON DELETE SET NULL,
  total_amount   NUMERIC(10,2) NOT NULL,
  status         hms_bill_status NOT NULL DEFAULT 'Due',
  issued_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX hms_bills_code_uq ON hms_bills (bill_code);

CREATE TABLE hms_payments (
  id                  SERIAL PRIMARY KEY,
  bill_id             INTEGER       NOT NULL REFERENCES hms_bills(id) ON DELETE CASCADE,
  amount              NUMERIC(10,2) NOT NULL,
  method              hms_payment_method NOT NULL DEFAULT 'Cash',
  received_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  recorded_by_user_id INTEGER       REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE hms_clinical_notes (
  id                   SERIAL PRIMARY KEY,
  patient_id           INTEGER NOT NULL REFERENCES hms_patients(id)    ON DELETE CASCADE,
  appointment_id       INTEGER          REFERENCES hms_appointments(id) ON DELETE SET NULL,
  author_clinician_id  INTEGER NOT NULL REFERENCES hms_clinicians(id)  ON DELETE RESTRICT,
  author_user_id       INTEGER          REFERENCES users(id)            ON DELETE SET NULL,
  subjective           TEXT    NOT NULL,
  assessment           TEXT    NOT NULL,
  plan                 TEXT    NOT NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX hms_clinical_notes_patient_idx ON hms_clinical_notes (patient_id, created_at);

CREATE TABLE hms_prescriptions (
  id                      SERIAL PRIMARY KEY,
  prescription_code       VARCHAR(28) NOT NULL,
  patient_id              INTEGER     NOT NULL REFERENCES hms_patients(id)    ON DELETE CASCADE,
  appointment_id          INTEGER              REFERENCES hms_appointments(id) ON DELETE SET NULL,
  prescriber_clinician_id INTEGER     NOT NULL REFERENCES hms_clinicians(id)  ON DELETE RESTRICT,
  author_user_id          INTEGER              REFERENCES users(id)            ON DELETE SET NULL,
  notes                   TEXT,
  status                  hms_prescription_status NOT NULL DEFAULT 'Active',
  prescribed_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX hms_prescriptions_code_uq    ON hms_prescriptions (prescription_code);
CREATE        INDEX hms_prescriptions_patient_idx ON hms_prescriptions (patient_id, prescribed_at);

CREATE TABLE hms_prescription_items (
  id              SERIAL PRIMARY KEY,
  prescription_id INTEGER     NOT NULL REFERENCES hms_prescriptions(id) ON DELETE CASCADE,
  medicine_name   VARCHAR(160) NOT NULL,
  dosage          VARCHAR(120) NOT NULL,
  route           VARCHAR(80)  NOT NULL DEFAULT 'Oral',
  frequency       VARCHAR(120) NOT NULL,
  duration_days   INTEGER,
  instructions    TEXT
);
CREATE INDEX hms_prescription_items_rx_idx ON hms_prescription_items (prescription_id);

CREATE TABLE hms_laboratory_orders (
  id                    SERIAL PRIMARY KEY,
  order_code            VARCHAR(28)  NOT NULL,
  patient_id            INTEGER      NOT NULL REFERENCES hms_patients(id)    ON DELETE CASCADE,
  appointment_id        INTEGER               REFERENCES hms_appointments(id) ON DELETE SET NULL,
  ordering_clinician_id INTEGER      NOT NULL REFERENCES hms_clinicians(id)  ON DELETE RESTRICT,
  author_user_id        INTEGER               REFERENCES users(id)            ON DELETE SET NULL,
  test_name             VARCHAR(180) NOT NULL,
  priority              hms_lab_priority NOT NULL DEFAULT 'Routine',
  status                hms_lab_status   NOT NULL DEFAULT 'Ordered',
  clinical_question     TEXT,
  ordered_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX hms_laboratory_orders_code_uq ON hms_laboratory_orders (order_code);
CREATE        INDEX hms_lab_orders_patient_idx     ON hms_laboratory_orders (patient_id, ordered_at);

CREATE TABLE hms_laboratory_results (
  id                       SERIAL PRIMARY KEY,
  laboratory_order_id      INTEGER NOT NULL REFERENCES hms_laboratory_orders(id) ON DELETE CASCADE,
  reported_by_clinician_id INTEGER          REFERENCES hms_clinicians(id)        ON DELETE SET NULL,
  result_summary           TEXT    NOT NULL,
  reference_range          VARCHAR(160),
  result_value             VARCHAR(160),
  reported_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX hms_lab_results_order_uq ON hms_laboratory_results (laboratory_order_id);

-- ─── Demo Seed Data ───────────────────────────────────────────────────────────
-- Demo user accounts (password hashes match the app's DEMO_ACCOUNTS constant)
-- Passwords: admin@clinicalledger.demo → CL-Admin!2026
--            doctor@clinicalledger.demo → CL-Doctor!2026
--            reception@clinicalledger.demo → CL-Front!2026

INSERT INTO users ("openId", name, email, "loginMethod", password_hash, role, is_active)
VALUES
  ('demo_hms_admin',
   'Amelia Rahman',
   'admin@clinicalledger.demo',
   'credential-demo',
   '73a5b98a3b9297374a8c141ace206e9e:db040ccf69e944325b6b0c5bf85b3ec4c0a4acc27560a40687d2cda16b64aa3bfbd20a0ce5fbe9d187eac4d88b7e4b3d346c539085fa0991b0f2db1807527306',
   'admin', 'yes'),
  ('demo_hms_doctor',
   'Dr. Samira Ahmed',
   'doctor@clinicalledger.demo',
   'credential-demo',
   '8aa44b54d3e5c66062947db3a2830fe2:926e375cec3aa559a0fb4ce6028fffacd678f62f31a8c3018025fb13087509fb2c819d3d05c8b0ffd8437c8824c229d46422f075de263f359ee46d015cef4c41',
   'doctor', 'yes'),
  ('demo_hms_reception',
   'Nusrat Jahan',
   'reception@clinicalledger.demo',
   'credential-demo',
   'dc8c723d22173b3394c792b7f4362998:575d153b4cd069a669b8df4719fe9a93984b013e81d5e804c25e4469642649bebffa9fbd47fc470405b3cf525ca9e3de3f5e4350e39145daf7e6be277940c91d',
   'receptionist', 'yes');

-- Clinicians
INSERT INTO hms_clinicians (user_id, full_name, specialty, department, color)
VALUES
  ((SELECT id FROM users WHERE "openId" = 'demo_hms_doctor'), 'Dr. Samira Ahmed',  'Cardiology',       'Cardiology',       '#007C83'),
  (NULL,                                                       'Dr. Mahmud Hasan',  'Endocrinology',    'Internal Medicine','#386B9D'),
  (NULL,                                                       'Dr. Tahmina Noor',  'Pathology',        'Laboratory',       '#8A5A9B'),
  (NULL,                                                       'Dr. Imran Kabir',   'General Medicine', 'Outpatient',       '#A56B31');

-- Patients
INSERT INTO hms_patients (patient_code, full_name, gender, phone, care_context)
VALUES
  ('P-1001', 'Ayesha Rahman', 'Female', '+8801711234890', 'Hypertension review'),
  ('P-1002', 'Karim Hossain', 'Male',   '+8801814876122', 'Diabetes follow-up'),
  ('P-1003', 'Nabila Islam',  'Female', '+8801612551809', 'Laboratory order'),
  ('P-1004', 'Rafiq Ahmed',   'Male',   '+8801911204778', 'Cardiology consult'),
  ('P-1005', 'Farzana Khan',  'Female', '+8801755660009', 'Medication refill');

-- Availability windows: Mon–Fri 09:00–17:00, 30-min slots for all clinicians
INSERT INTO hms_availability_windows (clinician_id, weekday, start_minute, end_minute, slot_minutes)
SELECT c.id, d.weekday, 540, 1020, 30
FROM hms_clinicians c
CROSS JOIN (VALUES (1),(2),(3),(4),(5)) AS d(weekday);

-- Appointments (today's date used as anchor via NOW())
INSERT INTO hms_appointments (appointment_code, patient_id, clinician_id, starts_at, ends_at, reason, status, created_by_user_id)
SELECT
  code, p.id, cl.id,
  DATE_TRUNC('day', NOW() AT TIME ZONE 'UTC') + slot_offset::interval,
  DATE_TRUNC('day', NOW() AT TIME ZONE 'UTC') + slot_offset::interval + INTERVAL '30 minutes',
  reason, status::hms_appointment_status,
  (SELECT id FROM users WHERE "openId" = 'demo_hms_admin')
FROM (VALUES
  ('A-4016', 'Ayesha Rahman',  'Dr. Samira Ahmed', INTERVAL '9 hours',        'Follow-up ECG',      'Scheduled'),
  ('A-4017', 'Karim Hossain',  'Dr. Mahmud Hasan', INTERVAL '10 hours 30 minutes', 'Diabetes review', 'Checked in'),
  ('A-4018', 'Nabila Islam',   'Dr. Tahmina Noor', INTERVAL '11 hours 15 minutes', 'CBC result review','Scheduled'),
  ('A-4019', 'Rafiq Ahmed',    'Dr. Samira Ahmed', INTERVAL '13 hours 45 minutes', 'New consultation','Scheduled')
) AS v(code, patient_name, clinician_name, slot_offset, reason, status)
JOIN hms_patients    p  ON p.full_name  = v.patient_name
JOIN hms_clinicians  cl ON cl.full_name = v.clinician_name;

-- Bills
INSERT INTO hms_bills (bill_code, patient_id, appointment_id, total_amount, status)
SELECT b.bill_code, p.id, a.id, b.total_amount::NUMERIC, b.status::hms_bill_status
FROM (VALUES
  ('B-5001', 'Ayesha Rahman', 'A-4016', '5420.00', 'Partial'),
  ('B-5002', 'Karim Hossain', 'A-4017', '3200.00', 'Paid'),
  ('B-5003', 'Nabila Islam',  'A-4018', '2750.00', 'Due')
) AS b(bill_code, patient_name, appt_code, total_amount, status)
JOIN hms_patients     p ON p.full_name       = b.patient_name
JOIN hms_appointments a ON a.appointment_code = b.appt_code;

-- Payments
INSERT INTO hms_payments (bill_id, amount, method, recorded_by_user_id)
SELECT bl.id, p.amount::NUMERIC, p.method::hms_payment_method,
       (SELECT id FROM users WHERE "openId" = 'demo_hms_admin')
FROM (VALUES
  ('B-5001', '2400.00', 'Mobile banking'),
  ('B-5002', '3200.00', 'Card')
) AS p(bill_code, amount, method)
JOIN hms_bills bl ON bl.bill_code = p.bill_code;

-- Clinical Notes
INSERT INTO hms_clinical_notes (patient_id, appointment_id, author_clinician_id, author_user_id, subjective, assessment, plan)
SELECT p.id, a.id, cl.id, u.id, n.subjective, n.assessment, n.plan
FROM (VALUES
  ('Ayesha Rahman', 'A-4016', 'Dr. Samira Ahmed', 'demo_hms_doctor',
   'Reports intermittent headaches with home blood-pressure readings above baseline.',
   'Essential hypertension requiring adherence review and cardiovascular risk follow-up.',
   'Continue amlodipine, review ECG, and repeat blood-pressure check in four weeks.'),
  ('Nabila Islam',  'A-4018', 'Dr. Tahmina Noor', 'demo_hms_admin',
   'Attended to discuss CBC and ESR laboratory review.',
   'Laboratory follow-up required; no immediate escalation noted in the clinical record.',
   'Review available results with the treating clinician and document follow-up guidance.')
) AS n(patient_name, appt_code, clinician_name, user_open_id, subjective, assessment, plan)
JOIN hms_patients     p  ON p.full_name        = n.patient_name
JOIN hms_appointments a  ON a.appointment_code = n.appt_code
JOIN hms_clinicians   cl ON cl.full_name       = n.clinician_name
JOIN users            u  ON u."openId"          = n.user_open_id;

-- Prescriptions
INSERT INTO hms_prescriptions (prescription_code, patient_id, appointment_id, prescriber_clinician_id, author_user_id, notes)
SELECT 'RX-7001', p.id, a.id, cl.id, u.id,
       'Take consistently and bring home blood-pressure readings to follow-up.'
FROM hms_patients    p  ON  p.full_name        = 'Ayesha Rahman'
JOIN hms_appointments a  ON  a.appointment_code = 'A-4016'
JOIN hms_clinicians   cl ON  cl.full_name       = 'Dr. Samira Ahmed'
JOIN users            u  ON  u."openId"          = 'demo_hms_doctor';

-- Prescription Items
INSERT INTO hms_prescription_items (prescription_id, medicine_name, dosage, route, frequency, duration_days, instructions)
SELECT rx.id, 'Amlodipine', '5 mg', 'Oral', 'Once daily', 30, 'Take in the morning.'
FROM hms_prescriptions rx WHERE rx.prescription_code = 'RX-7001';

-- Laboratory Orders
INSERT INTO hms_laboratory_orders (order_code, patient_id, appointment_id, ordering_clinician_id, author_user_id, test_name, priority, status, clinical_question)
SELECT 'LAB-8101', p.id, a.id, cl.id, u.id,
       'Lipid profile', 'Routine', 'Resulted',
       'Cardiovascular risk review in hypertension follow-up.'
FROM hms_patients     p  ON  p.full_name        = 'Ayesha Rahman'
JOIN hms_appointments a  ON  a.appointment_code = 'A-4016'
JOIN hms_clinicians   cl ON  cl.full_name       = 'Dr. Samira Ahmed'
JOIN users            u  ON  u."openId"          = 'demo_hms_doctor';

-- Laboratory Results
INSERT INTO hms_laboratory_results (laboratory_order_id, reported_by_clinician_id, result_summary, reference_range, result_value)
SELECT lo.id, cl.id,
       'Lipid profile completed and available for treating clinician review.',
       'Laboratory reference interval',
       'Result available'
FROM hms_laboratory_orders lo, hms_clinicians cl
WHERE lo.order_code = 'LAB-8101'
  AND cl.full_name  = 'Dr. Tahmina Noor';
