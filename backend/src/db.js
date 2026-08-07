import pg from 'pg';
import dotenv from 'dotenv';
import { logError, logInfo } from './logger.js';

dotenv.config();

const { Pool } = pg;

// We rely on pg.Pool's native connection string parsing


function summarizeSql(sql) {
  return String(sql || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500);
}

function paramTypes(params) {
  if (!Array.isArray(params)) return [];
  return params.map((v) => {
    if (v === null) return 'null';
    if (v === undefined) return 'undefined';
    if (v instanceof Date) return 'Date';
    if (Buffer.isBuffer(v)) return 'Buffer';
    if (Array.isArray(v)) return 'Array';
    return typeof v;
  });
}

const dbConfig = process.env.DATABASE_URL ? { connectionString: process.env.DATABASE_URL } : {};

export const pool = new Pool(dbConfig);

// Set São Paulo timezone for every new connection
pool.on('connect', (client) => {
  client.query("SET timezone = 'America/Sao_Paulo'");
});

export async function query(text, params) {
  const startedAt = Date.now();
  try {
    const res = await pool.query(text, params);
    const durationMs = Date.now() - startedAt;

    if (durationMs > 800) {
      logInfo('db.query_slow', {
        duration_ms: durationMs,
        sql: summarizeSql(text),
      });
    }

    return res;
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    logError('db.query_failed', error, {
      duration_ms: durationMs,
      sql: summarizeSql(text),
      param_count: Array.isArray(params) ? params.length : 0,
      param_types: paramTypes(params),
    });
    throw error;
  }
}

