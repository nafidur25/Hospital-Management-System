import postgres from "postgres";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

const dbUrl = process.env.DATABASE_URL;
console.log("Connecting to Supabase at:", dbUrl.replace(/:[^:@]+@/, ":****@"));

const sql = postgres(dbUrl, {
  ssl: { rejectUnauthorized: false },
  max: 1,
});

async function main() {
  try {
    const result = await sql`SELECT NOW() as current_time, current_database() as db_name;`;
    console.log("✅ Successfully connected to Supabase PostgreSQL!");
    console.log("Database response:", result[0]);

    // Check if tables already exist
    const tables = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `;
    console.log(`Found ${tables.length} tables in public schema:`, tables.map(t => t.table_name));

    if (tables.length === 0 || !tables.some(t => t.table_name === 'users')) {
      console.log("Applying supabase/setup.sql...");
      const setupSql = fs.readFileSync(path.join(process.cwd(), "supabase", "setup.sql"), "utf-8");
      await sql.unsafe(setupSql);
      console.log("✅ setup.sql executed successfully!");

      const newTables = await sql`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        ORDER BY table_name;
      `;
      console.log(`Now found ${newTables.length} tables:`, newTables.map(t => t.table_name));
    }

    // Verify user count
    const users = await sql`SELECT id, name, email, role FROM users;`;
    console.log(`Users in database (${users.length}):`, users);

    await sql.end();
    process.exit(0);
  } catch (err) {
    console.error("❌ Connection or execution failed:", err);
    await sql.end();
    process.exit(1);
  }
}

main();
