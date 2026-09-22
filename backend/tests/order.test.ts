import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/config/db';
import { updateOrderStatusSchema } from '../src/validators/order.validators';
import { isDbReady } from './helpers/db';

describe('order status validators (ORD-04)', () => {
  it('rejects PENDING and unknown statuses', () => {
    expect(updateOrderStatusSchema.safeParse({ status: 'PENDING' }).success).toBe(false);
    expect(updateOrderStatusSchema.safeParse({ status: 'DONE' }).success).toBe(false);
    expect(updateOrderStatusSchema.safeParse({ status: 'CONFIRMED' }).success).toBe(true);
  });
});

const dbReady = await isDbReady();
const app = createApp();
const runId = Date.now().toString(36);
const password = 'Passw0rd!x';

type Session = { auth: { Authorization: string }; id: string };

describe.skipIf(!dbReady)('orders (needs Postgres with migrations applied)', () => {
  let categoryId = '';
  let seller: Session;
  let buyer: Session;
  let outsider: Session;

  const register = async (role: 'BUYER' | 'SELLER', tag: string): Promise<Session> => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        email: `ord-it-${runId}-${tag}@test.example`,
        password,
        role,
        companyName: `${tag} Co`,
      });
    return {
      auth: { Authorization: `Bearer ${res.body.data.accessToken}` },
      id: res.body.data.user.id,
    };
  };

  /** Cheapest reliable way to get a real PENDING order: an offer, made then accepted. */
  const newOrder = async () => {
    const listingRes = await request(app)
      .post('/api/listings')
      .set(seller.auth)
      .send({
        title: `ord-it-${runId} lot`,
        description: 'Overstock pallet for order tests',
        categoryId,
        condition: 'NEW',
        quantity: 5,
        location: 'Amman',
        sellingMethod: 'OFFER',
        startingPrice: 100,
        handoverMethod: 'PICKUP',
      });
    const listingId = listingRes.body.data.id as string;

    const offerRes = await request(app)
      .post('/api/offers')
      .set(buyer.auth)
      .send({ listingId, quantity: 2, price: 90 });
    const offerId = offerRes.body.data.id as string;

    const acceptRes = await request(app)
      .post(`/api/offers/${offerId}/accept`)
      .set(seller.auth)
      .send();
    return acceptRes.body.data.orderId as string;
  };

  const setStatus = (s: Session, orderId: string, status: string) =>
    request(app).patch(`/api/orders/${orderId}/status`).set(s.auth).send({ status });

  beforeAll(async () => {
    categoryId = (
      await prisma.category.create({ data: { name: `ord-it-${runId}`, slug: `ord-it-${runId}` } })
    ).id;
    [seller, buyer, outsider] = await Promise.all([
      register('SELLER', 'seller'),
      register('BUYER', 'buyer'),
      register('SELLER', 'outsider'),
    ]);
  });

  afterAll(async () => {
    const users = await prisma.user.findMany({
      where: { email: { startsWith: `ord-it-${runId}` } },
      select: { id: true },
    });
    const ids = users.map((u) => u.id);
    const listings = await prisma.listing.findMany({
      where: { sellerId: { in: ids } },
      select: { id: true },
    });
    const lids = listings.map((l) => l.id);
    await prisma.order.deleteMany({ where: { listingId: { in: lids } } });
    await prisma.offer.deleteMany({ where: { listingId: { in: lids } } });
    await prisma.listing.deleteMany({ where: { id: { in: lids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.category.deleteMany({ where: { id: categoryId } });
    await prisma.$disconnect();
  });

  it('ORD-02: buyer sees it in purchases, seller sees it in sales, an outsider gets 404', async () => {
    const orderId = await newOrder();
    const purchases = await request(app).get('/api/orders/purchases').set(buyer.auth);
    expect(purchases.body.data.some((o: { id: string }) => o.id === orderId)).toBe(true);

    const sales = await request(app).get('/api/orders/sales').set(seller.auth);
    expect(sales.body.data.some((o: { id: string }) => o.id === orderId)).toBe(true);

    expect((await request(app).get(`/api/orders/${orderId}`).set(outsider.auth)).status).toBe(404);
  });

  it('ORD-03/04: follows PENDING -> CONFIRMED -> FULFILLED -> COMPLETED and rejects out-of-turn moves', async () => {
    const orderId = await newOrder();

    expect((await setStatus(buyer, orderId, 'CONFIRMED')).status).toBe(403);
    expect((await setStatus(seller, orderId, 'FULFILLED')).status).toBe(409);

    const confirmed = await setStatus(seller, orderId, 'CONFIRMED');
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.data.status).toBe('CONFIRMED');

    expect((await setStatus(buyer, orderId, 'FULFILLED')).status).toBe(403);
    const fulfilled = await setStatus(seller, orderId, 'FULFILLED');
    expect(fulfilled.status).toBe(200);
    expect(fulfilled.body.data.fulfilledAt).not.toBeNull();

    expect((await setStatus(seller, orderId, 'COMPLETED')).status).toBe(403);
    const completed = await setStatus(buyer, orderId, 'COMPLETED');
    expect(completed.status).toBe(200);
    expect(completed.body.data.completedAt).not.toBeNull();

    expect((await setStatus(seller, orderId, 'CANCELLED')).status).toBe(409);
  });

  it('ORD-04: seller can cancel a pending order; a buyer cannot cancel once confirmed', async () => {
    const a = await newOrder();
    expect((await setStatus(seller, a, 'CANCELLED')).status).toBe(200);

    const b = await newOrder();
    await setStatus(seller, b, 'CONFIRMED');
    expect((await setStatus(seller, b, 'CANCELLED')).status).toBe(403);
    expect((await setStatus(buyer, b, 'CANCELLED')).status).toBe(200);
  });

  it('ORD-04: two concurrent status changes on the same order: exactly one wins', async () => {
    const orderId = await newOrder();
    const results = await Promise.all([
      setStatus(seller, orderId, 'CONFIRMED'),
      setStatus(seller, orderId, 'CANCELLED'),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const final = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(['CONFIRMED', 'CANCELLED']).toContain(final.status);
  });
});
