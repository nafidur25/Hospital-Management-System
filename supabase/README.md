# Supabase PostgreSQL Setup Guide

Clinical Ledger HMS now uses **Supabase PostgreSQL** as its database backend. Follow these steps to get a fully working instance.

---

## 1. Create a Supabase Project

1. Go to [https://supabase.com](https://supabase.com) and sign in (or create a free account).
2. Click **New Project**.
3. Choose your organisation, give the project a name (e.g. `clinical-ledger`), choose a region close to your Vercel deployment (e.g. `us-east-1`), and set a strong database password. **Save this password** — you will need it for the connection string.
4. Wait for the project to finish provisioning (≈ 1–2 minutes).

---

## 2. Run the Setup SQL

1. In the Supabase dashboard sidebar, click **SQL Editor**.
2. Click **New query**.
3. Open the file [`supabase/setup.sql`](./setup.sql) in this repo.
4. Copy the entire content and paste it into the SQL Editor.
5. Click **Run** (or press `Ctrl + Enter`).

This creates all enums, tables, indexes, and inserts demo seed data (clinicians, patients, appointments, billing, medical records, and the three demo login accounts).

---

## 3. Get Your Connection String

In the Supabase dashboard:

1. Go to **Project Settings → Database**.
2. Under **Connection string**, select the **Transaction** tab.
3. Copy the URI — it will look like:
   ```
   postgresql://postgres.PROJECT_REF:YOUR_PASSWORD@aws-0-REGION.pooler.supabase.com:6543/postgres
   ```
   > **Use port 6543 (Transaction pooler)** for Vercel/serverless environments. Port 5432 (direct/session) is fine for local dev.

4. Replace `[YOUR-PASSWORD]` with the database password you set in step 1.

---

## 4. Configure Environment Variables

### Local Development

Edit `.env` in the project root:

```env
DATABASE_URL=postgresql://postgres.PROJECT_REF:YOUR_PASSWORD@aws-0-REGION.pooler.supabase.com:6543/postgres
JWT_SECRET=your-long-random-secret-here
```

### Vercel Deployment

1. Go to your Vercel project → **Settings → Environment Variables**.
2. Add:
   - `DATABASE_URL` = your Supabase Transaction pooler connection string
   - `JWT_SECRET` = a strong random secret (32+ characters)
3. Click **Save** and trigger a new deployment.

---

## 5. Demo Login Credentials

After running `setup.sql`, these accounts are ready:

| Role | Email | Password |
|------|-------|----------|
| Admin | `admin@clinicalledger.demo` | `CL-Admin!2026` |
| Doctor | `doctor@clinicalledger.demo` | `CL-Doctor!2026` |
| Receptionist | `reception@clinicalledger.demo` | `CL-Front!2026` |

---

## 6. Verify Locally

```bash
# Install dependencies (postgres.js replaces mysql2)
pnpm install

# Run the dev server (uses Supabase if DATABASE_URL is set, otherwise in-memory fallback)
pnpm dev
```

Open `http://localhost:3000` and sign in with any demo account.

---

## 7. Deploy to Vercel

```bash
# Push latest changes
git add -A && git commit -m "chore: migrate to Supabase PostgreSQL"
git push origin main
```

Vercel will auto-deploy. The app will connect to Supabase on first request and the demo accounts + seed data are already in the database from step 2.

---

## Architecture Notes

- **No RLS enabled**: The app uses server-side JWT session auth (not Supabase Auth), so the database is accessed only from the server, not directly from the browser. RLS can be added in the future as an extra layer if needed.
- **Connection pooler**: `postgres.js` manages a connection pool (`max: 10`). With Supabase's Transaction pooler, each query gets a connection from the pool and releases it immediately — ideal for Vercel's serverless functions.
- **In-memory fallback**: If `DATABASE_URL` is empty, the app runs entirely in memory with demo data. No database required for local development or demos.
- **Drizzle migrations**: Run `pnpm db:push` to re-generate and apply migrations via Drizzle Kit (requires `DATABASE_URL` to be set).
