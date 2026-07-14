import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { teamSettings } from './schema.js';

async function seed() {
  const databaseUrl = process.env.DATABASE_URL || 'postgresql://dmhub:dmhub@localhost:5432/dmhub';
  const sql = postgres(databaseUrl);
  const db = drizzle(sql);

  try {
    await db.insert(teamSettings).values({
      id: 1,
      name: 'DMHub Team',
      description: null,
      initialized: false,
    }).onConflictDoNothing();

    console.log('Seed completed: team_settings initial record inserted');
  } catch (error) {
    console.error('Seed failed:', error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

seed();
