# Antigravity Prompt — Full Hospital Management System

Copy everything below into Antigravity:

---

You are a senior full-stack TypeScript engineer. Build, or thoroughly complete and audit, a production-minded **Hospital Management System (HMS)** called **Clinical Ledger**. Deliver a working browser application, not a visual mockup. Preserve all existing working features unless an improvement is required below.

## Technology and architecture

Use **React 19, TypeScript, Vite, Tailwind CSS, Express, tRPC, Drizzle ORM, and MySQL/TiDB**. Keep authentication, authorization, validation, persistence, and scheduling logic on the server. Use a responsive dashboard layout with a role-aware sidebar. Keep all timestamps in UTC internally and format them in the user’s locale for display.

Use these primary roles:

| Role | Responsibilities |
|---|---|
| Administrator | Full operational access, reporting, billing, account lifecycle management, archive/recovery access, and supervised clinical administration. |
| Doctor | Clinical records, notes, prescriptions, laboratory orders/results, and appropriate scheduling visibility. No billing, reporting, account, archive, or operational record editing. |
| Receptionist | Patient registration, appointment booking/editing/check-in, billing/payment workflows, archive/recovery access for eligible operational records. No clinical records, reporting, or account management. |

Enforce every role boundary in **server-side tRPC procedures**, not only by hiding UI controls. Direct URLs must render a clear access-denied state for unauthorized roles.

## Required functional modules

Implement or preserve all of the following:

1. **Authentication and sessions.** Support the existing OAuth flow and a separate secure credential login path. Store passwords only as strong salted hashes (for example, Node `crypto.scrypt`); never return password hashes, open IDs, tokens, or secrets to the client. Users must have active/inactive lifecycle state, and inactive users must not authenticate or keep using existing sessions.

2. **Account management.** Administrators can create accounts, edit names/emails/roles, link a doctor account to a clinician profile, reset a password, and activate/deactivate accounts. Prevent self-deactivation and self-role lockout. Use confirmation for consequential actions.

3. **Patient registry.** Support creating and editing patient registrations, gender, phone, and care context. Admins and Receptionists can manage operations; Doctors cannot edit registration data.

4. **Appointment scheduling.** Provide an interactive clinician availability calendar with live open/booked states, weekday schedules, conflict-safe booking, and availability validation on the server. Booking and editing must include:
   - Patient selection.
   - Clinician selection.
   - Appointment date/time.
   - Required reason.
   - Optional **Appointment name** (for example, “Annual cardiac review”).
   - Server-side prevention of overlapping bookings and out-of-hours bookings.

5. **Clinical records.** Support persistent clinical notes, prescriptions with medication items, laboratory orders, and laboratory results. Doctors must be linked to their clinician profile, and the server must resolve the author identity rather than trusting browser input.

6. **Billing.** Keep bills and payments in a protected Billing workspace. Do not expose financial aggregates through generic overview responses or to unauthorized roles.

7. **Recoverable archive, not hard delete.** Do **not** permanently delete patient or appointment records through the operational UI. Add `archived_at` and `archived_by_user_id` fields to patients and appointments. Active registry, calendar, availability, and overview queries must exclude archived records.

   - Admins and Receptionists may archive only **Scheduled** or **Cancelled** appointments with no linked bill, clinical note, prescription, or laboratory order.
   - Admins and Receptionists may archive a patient only when the patient has no active appointment, bill, clinical note, prescription, or laboratory order.
   - Implement a detailed archive confirmation modal. It must identify the record, state that it leaves active operations but is **not permanently removed**, explain that it can be recovered, warn that clinical/billing history prevents archive, and explain that restored appointments are rechecked for conflicts.
   - Add an **Archive and recovery** page for authorized roles. Show archived patient registrations and appointments, the archive date, archivist name, relevant record details, and a Restore action.
   - Restore patient records to the active registry. Restore appointments only if the linked patient is active, the clinician is active, and the original appointment time still satisfies availability and conflict checks. If not, return a clear, actionable server error and leave the record archived.
   - Keep an audit-friendly archive trail. Do not remove `archived_by_user_id` data during restoration unless there is a separate audit event table capturing the original action.

8. **Responsive UX.** Design for desktop and mobile. On small screens, preserve visible access to patient/appointment edit actions in horizontally scrollable tables. Archive cards, confirmation dialogs, and Restore controls must remain readable and usable at a 375 × 812 viewport. Use keyboard-accessible dialogs, visible focus states, readable contrast, and sensible loading/empty/error states.

## Data and API requirements

Use Drizzle migrations. Do not make destructive schema changes without a migration and an explicit recovery plan. Keep the schema and live database synchronized.

Create or maintain tRPC procedures for:

- Patient create/update/archive/restore.
- Appointment create/update/status/archive/restore.
- Live clinician availability.
- Archive listing restricted to Administrator and Receptionist.
- Account lifecycle management restricted to Administrator.
- Clinical record writes restricted to Administrator and Doctor.
- Billing reads/writes restricted to authorized operational roles.

Use input validation with Zod. Implement database transactions where atomicity matters. Return clean, actionable errors for blocked archive or restore actions.

## Security requirements

- Never expose password hashes, raw session tokens, secret keys, OAuth client secrets, open IDs, or database credentials in responses or frontend code.
- Clear role-scoped React Query/tRPC cache data on login and logout so one user session cannot display another role’s cached navigation or data.
- Use HTTP-only secure session cookies in production.
- Keep database and storage credentials server-only.
- Do not fabricate customer reviews, ratings, or testimonials.

## Vercel deployment requirements

Make the project deployable to Vercel without changing the managed/local runtime behavior:

1. Add an `api/index.ts` Vercel Function entrypoint that creates and **default-exports** the Express application. Register the Express JSON parsers, OAuth routes, storage proxy routes, and tRPC middleware there. Do not call `listen()` in this Vercel entrypoint.
2. Keep the existing standalone Node server entrypoint for managed/local hosting.
3. Add `vercel.json` with:
   - `buildCommand` set to `pnpm build:vercel`.
   - `outputDirectory` set to the Vite static output directory, for example `dist/public`.
   - Node.js 22 runtime for `api/index.ts`.
   - A rewrite routing `/api/*` to the API Function.
   - A SPA fallback rewrite to `/index.html` that does not intercept API or static asset paths.
4. Add `build:vercel` to `package.json` to run the Vite production build only.
5. Write a Vercel deployment guide that clearly says the app needs **external** services. Document these environment variables conceptually:
   - `DATABASE_URL` for an externally reachable, TLS-enabled MySQL/TiDB database.
   - A new production `JWT_SECRET`.
   - OAuth provider/client/callback configuration.
   - External S3-compatible storage credentials if file storage is used.
6. Do not copy any managed-platform-injected secrets into Vercel. Explain that Vercel Preview and Production each need appropriately scoped secrets and OAuth redirect URLs such as `https://your-domain/api/oauth/callback`.

## Quality gates and deliverables

Before declaring completion:

1. Run TypeScript checking with `pnpm check`.
2. Run the full automated suite with `pnpm test`.
3. Run the standard production build with `pnpm build`.
4. Run `pnpm build:vercel`.
5. Add a self-cleaning live database verification script that creates a temporary patient and appointment, archives both, verifies they disappear from active queries and appear in archive queries, restores both, verifies they return, and cleans up the temporary data.
6. Add tests for archive/restore authorization, archive integrity restrictions, restore conflict protection, no-secret account responses, and Vercel configuration.
7. Manually verify, at desktop and 375 × 812, the archive confirmation modal, Archive page, Restore controls, role restrictions, and appointment name field.
8. Provide a concise `VERIFICATION.md`, `ACCESS_CONTROL.md`, and `DEPLOYMENT.md` explaining behavior and external Vercel setup.

Deliver clean, readable, modular TypeScript. Prefer secure, maintainable implementation over shortcuts. Do not merely describe the features: implement them end to end, run the checks, and report the exact validation results.

---
