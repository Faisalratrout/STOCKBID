import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/config/db';
import { setInterestsSchema, updateProfileSchema } from '../src/validators/profile.validators';
import { isDbReady } from './helpers/db';

describe('profile validators', () => {
  it('requires at least one field', () => {
    expect(updateProfileSchema.safeParse({}).success).toBe(false);
  });

  it('treats empty strings as clearing a field', () => {
    expect(updateProfileSchema.parse({ industry: '  ' })).toEqual({ industry: null });
  });

  it('rejects malformed phone numbers and non-uuid category ids', () => {
    expect(updateProfileSchema.safeParse({ phone: 'call me' }).success).toBe(false);
    expect(setInterestsSchema.safeParse({ categoryIds: ['nope'] }).success).toBe(false);
  });
});

const dbReady = await isDbReady();
const app = createApp();
const runId = Date.now().toString(36);
const email = `prof-it-${runId}@test.example`;

describe.skipIf(!dbReady)('profile + categories (needs Postgres with migrations applied)', () => {
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { startsWith: `prof-it-${runId}` } } });
    await prisma.category.deleteMany({ where: { slug: { startsWith: `prof-it-${runId}` } } });
    await prisma.$disconnect();
  });

  it('lets a business edit its profile, hides the phone publicly, and replaces interests', async () => {
    const cats = await Promise.all(
      [1, 2].map((n) =>
        prisma.category.create({
          data: { name: `prof-it-${runId}-${n}`, slug: `prof-it-${runId}-${n}` },
        }),
      ),
    );
    const [c1, c2] = cats as [(typeof cats)[number], (typeof cats)[number]];

    const reg = await request(app)
      .post('/api/auth/register')
      .send({ email, password: 'Passw0rd!x', role: 'BUYER', companyName: 'Prof Co' });
    const auth = { Authorization: `Bearer ${reg.body.data.accessToken}` };
    const userId = reg.body.data.user.id as string;

    const patch = await request(app)
      .patch('/api/profile/me')
      .set(auth)
      .send({ phone: '+962 79 123 4567', location: 'Amman' });
    expect(patch.status).toBe(200);
    expect(patch.body.data.phone).toBe('+962 79 123 4567');

    const pub = await request(app).get(`/api/profile/${userId}`);
    expect(pub.status).toBe(200);
    expect(pub.body.data.companyName).toBe('Prof Co');
    expect(pub.body.data).not.toHaveProperty('phone');

    await request(app)
      .put('/api/profile/me/interests')
      .set(auth)
      .send({ categoryIds: [c1.id] });
    const second = await request(app)
      .put('/api/profile/me/interests')
      .set(auth)
      .send({ categoryIds: [c2.id, c2.id] });
    expect(second.status).toBe(200);
    expect(second.body.data.categoryInterests.map((c: { id: string }) => c.id)).toEqual([c2.id]);

    const bad = await request(app)
      .put('/api/profile/me/interests')
      .set(auth)
      .send({ categoryIds: ['00000000-0000-4000-8000-000000000000'] });
    expect(bad.status).toBe(400);

    const list = await request(app).get('/api/categories');
    expect(list.status).toBe(200);
    expect(list.body.data.some((c: { id: string }) => c.id === c1.id)).toBe(true);
  });

  it('rejects unauthenticated access to /profile/me', async () => {
    expect((await request(app).get('/api/profile/me')).status).toBe(401);
  });
});
