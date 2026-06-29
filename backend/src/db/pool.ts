import pg from 'pg';
import dotenv from 'dotenv';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { pool as mockPool } from './mockPool.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../.env') });

const { Pool } = pg;

export const pool = process.env.USE_MOCK_DB === 'true' || !process.env.DATABASE_URL
  ? (mockPool as any)
  : new Pool({
    connectionString: process.env.DATABASE_URL,
  });

if (process.env.USE_MOCK_DB === 'true' || !process.env.DATABASE_URL) {
  console.log('Using mockup database for Sprout demo');
} else {
  pool.on('error', (err: any) => {
    console.error('Unexpected error on idle client', err);
    process.exit(-1);
  });
}
