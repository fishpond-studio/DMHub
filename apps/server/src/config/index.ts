import dotenv from 'dotenv';
import { resolve } from 'path';
import { z } from 'zod';

dotenv.config({ path: resolve(process.cwd(), '../../.env') });

const envSchema = z.object({
  PORT: z.coerce.number().default(8088),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  ENCRYPTION_KEY: z.string().min(32, 'ENCRYPTION_KEY must be at least 32 characters'),
  DATABASE_URL: z.string().optional(),
  DB_TYPE: z.enum(['postgresql', 'mariadb', 'mysql']).default('postgresql'),
  TABLE_PREFIX: z.string().optional().describe('已废弃，保留兼容'),
  REDIS_URL: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

function loadConfig(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('Invalid environment variables:', result.error.flatten().fieldErrors);
    throw new Error('Invalid environment variables');
  }
  return result.data;
}

export const config = loadConfig();
