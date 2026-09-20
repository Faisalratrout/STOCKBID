// Loaded before every test file: gives env.ts valid values without needing a real .env.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ??=
  'postgresql://stockbid:stockbid_dev_password@localhost:5432/stockbid_test';
process.env.JWT_ACCESS_SECRET ??= 'test-access-secret-test-access-secret-0000';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret-test-refresh-secret-000';
