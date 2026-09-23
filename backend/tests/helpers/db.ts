import { Client } from 'pg';

const checkDb = async (): Promise<boolean> => {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 2000,
  });
  try {
    await client.connect();
    const { rows } = await client.query("SELECT to_regclass('public.users') AS t");
    return rows[0]?.t !== null;
  } catch {
    return false;
  } finally {
    await client.end().catch(() => undefined);
  }
};

/** True when Postgres is reachable AND migrated. Used with describe.skipIf; in CI a false result throws so DB tests can't silently skip. */
export const isDbReady = async (): Promise<boolean> => {
  const ready = await checkDb();
  if (!ready && process.env.CI) {
    throw new Error('CI requires a reachable, migrated Postgres; refusing to skip DB tests');
  }
  return ready;
};
