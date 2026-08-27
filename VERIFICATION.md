# HMS Upgrade Verification Record

## Protected access and role boundaries

The application uses an explicit, server-enforced role model across all procedures:
- **Administrator**: Full operational access, reporting, billing desk, account lifecycle management, archive/recovery access, and supervised clinical administration.
- **Doctor**: Clinical notes, prescriptions with medication items, laboratory orders and results, and live scheduling visibility. Direct access to billing, reporting, account management, operational editing, or archive recovery is rejected at the server level with HTTP 403 / `FORBIDDEN`.
- **Receptionist**: Patient registration, appointment booking/editing/check-in, and billing/payment workflows, with archive/recovery access for eligible records. Clinical records, management reports, and account credentials are strictly forbidden.

Direct restricted workspace URLs render a clear access-denied UI (`AccessDenied`) with a return-to-overview action. Unauthenticated browser visits render the signed-out **Protected clinical workspace** gate with credential login guidance and OAuth integration.

## Booking logic and scheduling integrity

- Interactive clinician availability calendar computes live open/booked states based on weekly schedules.
- Overlapping bookings and requests outside published clinician hours are rejected with actionable server errors.
- Confirming an appointment revalidates clinician availability and conflict checks inside a database transaction.
- Supports optional **Appointment name** (e.g. "Annual cardiac review") alongside the required reason.
- Active calendar and availability queries exclude archived appointments.

## Recoverable archive and conflict-safe restoration

- Operational hard delete is replaced with soft delete: records receive `archived_at` and `archived_by_user_id`.
- **Archival eligibility**:
  - Appointments can only be archived if their status is `Scheduled` or `Cancelled` and they have no linked bills, clinical notes, prescriptions, or laboratory orders.
  - Patients can only be archived when they have no active appointments, bills, clinical notes, prescriptions, or laboratory orders.
- **Archive Confirmation Modal**:
  - Identifies the record.
  - Explains that the record leaves active operations but is not permanently removed.
  - Explains that the record can be recovered from the Archive workspace.
  - Warns that clinical and financial history prevents archival.
  - Notes that restored appointments are rechecked for scheduling conflicts.
- **Archive & Recovery Workspace**:
  - Accessible to Administrators and Receptionists.
  - Displays archived patients and appointments, archive timestamps, and archivist names.
  - Restoring a patient returns them to the active directory.
  - Restoring an appointment validates that the linked patient is active, the clinician is active, and the original appointment slot satisfies availability and conflict rules. If a conflict exists, the appointment remains archived with a clear server error.
  - **Audit trail preservation**: Restoration clears `archived_at = null` while preserving `archived_by_user_id` as the historical record of who performed the archival.

## Security and credential hygiene

- Password hashes, open IDs, raw session tokens, secret keys, OAuth client secrets, and database credentials are never returned to client responses.
- `auth.me` procedure sanitizes user objects and returns only safe identity attributes (`id`, `name`, `email`, `role`, `isActive`, `loginMethod`, `lastSignedIn`).
- Passwords are encrypted using strong salted hashes (`crypto.scrypt`).
- Inactive user accounts cannot authenticate or continue existing sessions.
- React Query / tRPC HMS-scoped cache entries are purged upon sign-in and sign-out to prevent cross-role data leaks.

## Responsive UI verification (Desktop & 375 × 812 Viewport)

- Tested and verified at standard desktop resolutions and a mobile viewport of 375 × 812.
- Horizontally scrollable tables ensure full data visibility while keeping edit and action triggers accessible.
- Archive confirmation dialogs and restore controls use responsive stacked action layouts (`flex-col-reverse` to `sm:flex-row`).
- Calendar booking card and account lifecycle controls maintain readable contrast and full accessibility on narrow screens.

## Vercel deployment verification

- `api/index.ts` creates and default-exports the Express application with body parsers, OAuth routes, storage proxy routes, and tRPC middleware (without calling `listen()`).
- `vercel.json` configures `buildCommand: pnpm build:vercel`, `outputDirectory: dist/public`, `nodejs22.x` runtime for `api/index.ts`, and clean rewrites for `/api/*` and SPA fallback `/index.html`.
- `pnpm build:vercel` builds Vite static assets to `dist/public`.

## Automated test suites

The automated test suite verifies:
1. `server/hms.router.test.ts`: Role-protected mutations, receptionist booking/payment/registration, admin/receptionist operational edits, admin-only account lifecycle with self-lockout prevention, doctor clinical record writes with resolved identity, doctor billing lockouts, and no-secret response sanitization.
2. `server/archive-integrity.test.ts`: Archive eligibility rules, rejection of completed/in-progress appointments, rejection of linked bills/notes/rx/orders, conflict checking on appointment restoration, and audit trail preservation.
3. `server/demo-auth.test.ts`: Demo credential login for Admin, Doctor, and Receptionist issuing secure session cookies, rejection of invalid credentials.
4. `server/auth.logout.test.ts`: Session cookie clearance upon logout.
5. `server/scheduling.test.ts`: Slot availability calculations, range overlap detection, booking conflict prevention, and out-of-hours prevention.
6. `server/home-view-guard.test.ts` & `server/home-view-render.test.ts`: Direct URL role guards and access-denied UI rendering.
7. `server/signedout-entry.test.ts`: Signed-out workspace entry screen and credential guidance.
8. `server/vercel-config.test.ts`: Vercel configuration integrity and rewrite rules.
