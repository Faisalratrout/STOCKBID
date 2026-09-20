// Loaded before every test file. DB-backed tests use DATABASE_URL from .env (the dev
// database) and clean up the rows they create; they skip themselves when the DB is unreachable.
import 'dotenv/config';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ??=
  'postgresql://stockbid:stockbid_dev_password@localhost:5432/stockbid?schema=public';
process.env.JWT_ACCESS_SECRET ??= 'test-access-secret-test-access-secret-0000';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret-test-refresh-secret-000';
