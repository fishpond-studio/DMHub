import { defineConfig } from 'drizzle-kit';

const dbType = (process.env.DB_TYPE ?? 'postgresql').toLowerCase();
const isMysql = dbType === 'mysql' || dbType === 'mariadb';

export default defineConfig({
  schema: isMysql ? './src/db/schema-mysql.ts' : './src/db/schema-pg.ts',
  out: isMysql ? './drizzle/mysql' : './drizzle/postgresql',
  dialect: isMysql ? 'mysql' : 'postgresql',
  dbCredentials: {
    url:
      process.env.DATABASE_URL ||
      (isMysql ? 'mysql://dmhub:dmhub@localhost:3306/dmhub' : 'postgresql://dmhub:dmhub@localhost:5432/dmhub'),
  },
});
