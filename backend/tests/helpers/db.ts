import { Client } from 'pg';

/** True when Postgres is reachable AND migrations have been applied. Used with describe.skipIf. */
export const isDbReady = async (): Promise<boolean> => {
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
