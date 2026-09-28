import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/config/db';
import { signAccessToken } from '../src/utils/tokens';
import { updateOrderStatusSchema } from '../src/validators/order.validators';
import { isDbReady } from './helpers/db';
import { markEmailVerified } from './helpers/users';

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

  const register = async (role: 'BUYER' | 'SELLER', tag: string, verified = true): Promise<Session> => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        email: `ord-it-${runId}-${tag}@test.example`,
        password,
        role,
        companyName: `${tag} Co`,
      });
    if (verified) await markEmailVerified(res.body.data.user.id);
    return {
      auth: { Authorization: `Bearer ${res.body.data.accessToken}` },
      id: res.body.data.user.id,
    };
  };

  /** Cheapest reliable way to get a real PENDING order: an offer, made then accepted. */
  const newOfferOrder = async (quantity = 5, take = 2) => {
    const listingRes = await request(app)
      .post('/api/listings')
      .set(seller.auth)
      .send({
        title: `ord-it-${runId} lot`,
        description: 'Overstock pallet for order tests',
        categoryId,
        condition: 'NEW',
        quantity,
        location: 'Amman',
        sellingMethod: 'OFFER',
        startingPrice: 100,
        handoverMethod: 'PICKUP',
      });
    const listingId = listingRes.body.data.id as string;

    const offerRes = await request(app)
      .post('/api/offers')
      .set(buyer.auth)
      .send({ listingId, quantity: take, price: 90 });
    const offerId = offerRes.body.data.id as string;

    const acceptRes = await request(app)
      .post(`/api/offers/${offerId}/accept`)
      .set(seller.auth)
      .send();
    return { orderId: acceptRes.body.data.orderId as string, listingId };
  };

  const newOrder = async () => (await newOfferOrder()).orderId;

  const listingState = (id: string) =>
    prisma.listing.findUniqueOrThrow({
      where: { id },
      select: { quantityAvailable: true, status: true },
    });

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

  it('ORD-04: either party can cancel while PENDING or CONFIRMED', async () => {
    for (const from of ['PENDING', 'CONFIRMED'] as const) {
      for (const who of [buyer, seller]) {
        const orderId = await newOrder();
        if (from === 'CONFIRMED') await setStatus(seller, orderId, 'CONFIRMED');
        const res = await setStatus(who, orderId, 'CANCELLED');
        expect(res.status).toBe(200);
        expect(res.body.data.status).toBe('CANCELLED');
      }
    }
  });

  it('ORD-04: nobody can cancel once FULFILLED, and outsiders never can', async () => {
    const orderId = await newOrder();
    expect((await setStatus(outsider, orderId, 'CANCELLED')).status).toBe(404);
    await setStatus(seller, orderId, 'CONFIRMED');
    await setStatus(seller, orderId, 'FULFILLED');
    expect((await setStatus(buyer, orderId, 'CANCELLED')).status).toBe(409);
    expect((await setStatus(seller, orderId, 'CANCELLED')).status).toBe(409);
  });

  it('ORD-04: cancelling an offer order returns its units to the listing', async () => {
    const { orderId, listingId } = await newOfferOrder(5, 2);
    expect(await listingState(listingId)).toEqual({ quantityAvailable: 3, status: 'ACTIVE' });
    expect((await setStatus(buyer, orderId, 'CANCELLED')).status).toBe(200);
    expect(await listingState(listingId)).toEqual({ quantityAvailable: 5, status: 'ACTIVE' });
  });

  it('ORD-04: cancelling the order that sold a listing out reopens it as ACTIVE', async () => {
    const { orderId, listingId } = await newOfferOrder(4, 4);
    expect(await listingState(listingId)).toEqual({ quantityAvailable: 0, status: 'SOLD' });
    await setStatus(seller, orderId, 'CONFIRMED');
    expect((await setStatus(seller, orderId, 'CANCELLED')).status).toBe(200);
    expect(await listingState(listingId)).toEqual({ quantityAvailable: 4, status: 'ACTIVE' });
  });

  it('ORD-04: buyer and seller cancelling at once: one wins and stock comes back once', async () => {
    const { orderId, listingId } = await newOfferOrder(5, 2);
    const results = await Promise.all([
      setStatus(buyer, orderId, 'CANCELLED'),
      setStatus(seller, orderId, 'CANCELLED'),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await listingState(listingId)).toEqual({ quantityAvailable: 5, status: 'ACTIVE' });
  });

  it('ORD-04: two concurrent identical status changes on the same order: exactly one wins', async () => {
    const orderId = await newOrder();
    const results = await Promise.all([
      setStatus(seller, orderId, 'CONFIRMED'),
      setStatus(seller, orderId, 'CONFIRMED'),
    ]);
    // The loser either fails the WHERE guard or sees CONFIRMED -> CONFIRMED: 409 both ways.
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe(
      'CONFIRMED',
    );
  });

  it('ORD-03: an admin status change notifies both the buyer and the seller', async () => {
    const admin = await prisma.user.create({
      data: {
        email: `ord-it-${runId}-admin@test.example`,
        passwordHash: 'not-used',
        role: 'ADMIN',
        isEmailVerified: true,
      },
    });
    const adminAuth = {
      Authorization: `Bearer ${signAccessToken({ id: admin.id, role: 'ADMIN' })}`,
    };
    const orderId = await newOrder();
    const res = await request(app)
      .patch(`/api/orders/${orderId}/status`)
      .set(adminAuth)
      .send({ status: 'CONFIRMED' });
    expect(res.status).toBe(200);

    for (const userId of [buyer.id, seller.id]) {
      expect(
        await prisma.notification.count({
          where: { userId, type: 'ORDER_STATUS_CHANGED', relatedEntityId: orderId },
        }),
      ).toBe(1);
    }
  });
});
