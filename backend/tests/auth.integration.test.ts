import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/config/db';
import { isDbReady } from './helpers/db';

const dbReady = await isDbReady();
const app = createApp();
const runId = Date.now().toString(36);
const email = `auth-it-${runId}@test.example`;
const password = 'Passw0rd!x';

describe.skipIf(!dbReady)('auth flow (needs Postgres with migrations applied)', () => {
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { startsWith: `auth-it-${runId}` } } });
    await prisma.$disconnect();
  });

  let refreshToken = '';

  it('registers a user with a business profile and never returns the hash', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email, password, role: 'SELLER', companyName: 'Test Co' });
    expect(res.status).toBe(201);
    expect(res.body.data.user).toMatchObject({ email, role: 'SELLER', companyName: 'Test Co' });
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash/);
    refreshToken = res.body.data.refreshToken;
  });

  it('rejects a duplicate email', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email, password, role: 'BUYER', companyName: 'Dup' });
    expect(res.status).toBe(409);
  });

  it('rejects a wrong password with a generic message', async () => {
    const res = await request(app).post('/api/auth/login').send({ email, password: 'Wrong123!' });
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe('Invalid email or password');
  });

  it('rotates refresh tokens and treats replay of the old token as theft', async () => {
    const first = await request(app).post('/api/auth/refresh').send({ refreshToken });
    expect(first.status).toBe(200);
    const newRefresh = first.body.data.refreshToken as string;
    expect(newRefresh).not.toBe(refreshToken);

    // Replaying the already-rotated token fails AND revokes the whole family.
    const replay = await request(app).post('/api/auth/refresh').send({ refreshToken });
    expect(replay.status).toBe(401);
    const afterTheft = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: newRefresh });
    expect(afterTheft.status).toBe(401);
  });

  it('two concurrent refreshes with the same token: exactly one succeeds', async () => {
    const login = await request(app).post('/api/auth/login').send({ email, password });
    const token = login.body.data.refreshToken as string;
    const results = await Promise.all([
      request(app).post('/api/auth/refresh').send({ refreshToken: token }),
      request(app).post('/api/auth/refresh').send({ refreshToken: token }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 401]);
  });

  it('password reset revokes sessions and the token is single-use', async () => {
    const login = await request(app).post('/api/auth/login').send({ email, password });
    const token = login.body.data.refreshToken as string;

    // Forgot-password answers identically for unknown emails (no enumeration).
    const unknown = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: `nobody-${runId}@test.example` });
    expect(unknown.status).toBe(200);

    // Mail is stubbed, so mint a known reset token directly.
    const { randomToken, sha256 } = await import('../src/utils/tokens');
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    const resetToken = randomToken();
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: sha256(resetToken),
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    const reset = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: resetToken, password: 'NewPassw0rd!y' });
    expect(reset.status).toBe(200);

    const reuse = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: resetToken, password: 'Another1pass' });
    expect(reuse.status).toBe(400);

    const oldSession = await request(app).post('/api/auth/refresh').send({ refreshToken: token });
    expect(oldSession.status).toBe(401);

    const relogin = await request(app)
      .post('/api/auth/login')
      .send({ email, password: 'NewPassw0rd!y' });
    expect(relogin.status).toBe(200);
  });
});
