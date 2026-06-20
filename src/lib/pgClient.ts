import { Pool } from "pg"

/**
 * Singleton PostgreSQL pool for the GPS India primary database.
 *
 * Reads DATABASE_URL. No ORM — all queries are raw parameterised SQL.
 *
 * RLS note: the `leads` and `submission_events` tables have row-level security
 * enabled. We connect as the configured role (typically the superuser) and scope
 * every query manually with `WHERE partner_org_id = $1`. Never rely on RLS from
 * this layer.
 */

declare global {
  // eslint-disable-next-line no-var
  var pgPool: Pool | null | undefined
}

function getPool(): Pool {
  if (global.pgPool) {
    return global.pgPool
  }

  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set. PostgreSQL features are unavailable.")
  }

  const pool = new Pool({ connectionString, max: 10 })
  global.pgPool = pool
  return pool
}

/** True when a PostgreSQL connection string is configured. */
export function hasPostgres(): boolean {
  return Boolean(process.env.DATABASE_URL)
}

/** Run a query and return all rows. */
export async function query<T = Record<string, unknown>>(
  sql: string,
  params?: unknown[],
): Promise<T[]> {
  const pool = getPool()
  const result = await pool.query(sql, params)
  return result.rows as T[]
}

/** Run a query and return the first row, or null. */
export async function queryOne<T = Record<string, unknown>>(
  sql: string,
  params?: unknown[],
): Promise<T | null> {
  const rows = await query<T>(sql, params)
  return rows[0] ?? null
}
