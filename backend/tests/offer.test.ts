import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/config/db';
import { expireStaleOffers } from '../src/services/offer.service';
import { counterOfferSchema, createOfferSchema } from '../src/validators/offer.validators';
import { isDbReady } from './helpers/db';

describe('offer validators (OFR-01)', () => {
  const listingId = '00000000-0000-4000-8000-000000000001';

  it('accepts whole units and cent-precision prices only', () => {
    expect(createOfferSchema.safeParse({ listingId, quantity: 2, price: 9.99 }).success).toBe(true);
    expect(createOfferSchema.safeParse({ listingId, quantity: 1.5, price: 9.99 }).success).toBe(
      false,
    );
    expect(createOfferSchema.safeParse({ listingId, quantity: 1, price: 9.999 }).success).toBe(
      false,
    );
    expect(createOfferSchema.safeParse({ listingId, quantity: 1, price: 0 }).success).toBe(false);
  });

  it('requires quantity and price on a counter', () => {
    expect(counterOfferSchema.safeParse({ quantity: 3 }).success).toBe(false);
  });
});

const dbReady = await isDbReady();
const app = createApp();
const runId = Date.now().toString(36);
const password = 'Passw0rd!x';

type Session = { auth: { Authorization: string }; id: string };

describe.skipIf(!dbReady)('offers (needs Postgres with migrations applied)', () => {
  let categoryId = '';
  let seller: Session;
  let buyerA: Session;
  let buyerB: Session;
  let outsider: Session;

  const register = async (role: 'BUYER' | 'SELLER', tag: string): Promise<Session> => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        email: `offer-it-${runId}-${tag}@test.example`,
        password,
        role,
        companyName: `${tag} Co`,
      });
    return {
      auth: { Authorization: `Bearer ${res.body.data.accessToken}` },
      id: res.body.data.user.id,
    };
  };

  const newListing = async (quantity: number, over: Record<string, unknown> = {}) => {
    const res = await request(app)
      .post('/api/listings')
      .set(seller.auth)
      .send({
        title: `offer-it-${runId} lot`,
        description: 'Overstock pallet for offer tests',
        categoryId,
        condition: 'NEW',
        quantity,
        location: 'Amman',
        sellingMethod: 'OFFER',
        startingPrice: 100,
        handoverMethod: 'PICKUP',
        ...over,
      });
    return res.body.data.id as string;
  };

  const offer = (s: Session, listingId: string, quantity: number, price = 90) =>
    request(app).post('/api/offers').set(s.auth).send({ listingId, quantity, price });

  const act = (s: Session, offerId: string, action: string, body?: object) =>
    request(app).post(`/api/offers/${offerId}/${action}`).set(s.auth).send(body);

  const listingState = (id: string) =>
    prisma.listing.findUniqueOrThrow({
      where: { id },
      select: { quantityAvailable: true, status: true },
    });

  beforeAll(async () => {
    categoryId = (
      await prisma.category.create({
        data: { name: `offer-it-${runId}`, slug: `offer-it-${runId}` },
      })
    ).id;
    [seller, buyerA, buyerB, outsider] = await Promise.all([
      register('SELLER', 'seller'),
      register('BUYER', 'buyerA'),
      register('BUYER', 'buyerB'),
      register('SELLER', 'outsider'),
    ]);
  });

  afterAll(async () => {
    const users = await prisma.user.findMany({
      where: { email: { startsWith: `offer-it-${runId}` } },
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
    await prisma.auction.deleteMany({ where: { listingId: { in: lids } } });
    await prisma.listing.deleteMany({ where: { id: { in: lids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.category.deleteMany({ where: { id: categoryId } });
    await prisma.$disconnect();
  });

  it('OFR-01/02: buyer offers, seller sees it in the inbox and is notified', async () => {
    const listingId = await newListing(10);
    const res = await offer(buyerA, listingId, 4);
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      status: 'PENDING',
      quantity: 4,
      createdBySellerCounter: false,
    });

    const inbox = await request(app)
      .get('/api/offers/received')
      .set(seller.auth)
      .query({ listingId });
    expect(inbox.body.data.map((o: { id: string }) => o.id)).toEqual([res.body.data.id]);

    const mine = await request(app).get('/api/offers/mine').set(buyerA.auth);
    expect(mine.body.data.some((o: { id: string }) => o.id === res.body.data.id)).toBe(true);

    const notes = await prisma.notification.findMany({
      where: { userId: seller.id, type: 'NEW_OFFER', relatedEntityId: res.body.data.id },
    });
    expect(notes).toHaveLength(1);
  });

  it('rejects offers on auction listings, above stock, and from sellers', async () => {
    const endAt = new Date(Date.now() + 86_400_000).toISOString();
    const auctionId = await newListing(5, {
      sellingMethod: 'AUCTION',
      auction: { minIncrement: 5, endAt },
    });
    expect((await offer(buyerA, auctionId, 1)).status).toBe(400);

    const listingId = await newListing(3);
    expect((await offer(buyerA, listingId, 4)).status).toBe(400);
    expect((await offer(outsider, listingId, 1)).status).toBe(403);
  });

  it('two simultaneous offers from one buyer: exactly one open offer survives', async () => {
    const listingId = await newListing(10);
    const results = await Promise.all([offer(buyerA, listingId, 1), offer(buyerA, listingId, 2)]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await prisma.offer.count({ where: { listingId, status: 'PENDING' } })).toBe(1);
  });

  it('OFR-03: two offers that together exceed stock cannot both be accepted concurrently', async () => {
    const listingId = await newListing(10);
    const a = (await offer(buyerA, listingId, 6)).body.data.id as string;
    const b = (await offer(buyerB, listingId, 6)).body.data.id as string;

    const results = await Promise.all([act(seller, a, 'accept'), act(seller, b, 'accept')]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);

    expect(await listingState(listingId)).toEqual({ quantityAvailable: 4, status: 'ACTIVE' });
    expect(await prisma.order.count({ where: { listingId } })).toBe(1);
  });

  it('OFR-03: accepting the same offer twice at once creates one order and takes stock once', async () => {
    const listingId = await newListing(10);
    const id = (await offer(buyerA, listingId, 3)).body.data.id as string;

    const results = await Promise.all([act(seller, id, 'accept'), act(seller, id, 'accept')]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await prisma.order.count({ where: { offerId: id } })).toBe(1);
    expect((await listingState(listingId)).quantityAvailable).toBe(7);
  });

  it('ORD-01: accepting creates the order with per-unit agreed price; selling out marks SOLD and expires rivals', async () => {
    const listingId = await newListing(5);
    const winning = (await offer(buyerA, listingId, 5, 88.5)).body.data.id as string;
    const rival = (await offer(buyerB, listingId, 2)).body.data.id as string;

    const res = await act(seller, winning, 'accept');
    expect(res.status).toBe(200);
    expect(res.body.data.offer.status).toBe('ACCEPTED');

    const order = await prisma.order.findUniqueOrThrow({ where: { id: res.body.data.orderId } });
    expect(order).toMatchObject({
      buyerId: buyerA.id,
      sellerId: seller.id,
      quantity: 5,
      sourceType: 'OFFER',
      status: 'PENDING',
    });
    expect(order.agreedPrice.toString()).toBe('88.5');

    expect(await listingState(listingId)).toEqual({ quantityAvailable: 0, status: 'SOLD' });
    expect((await prisma.offer.findUniqueOrThrow({ where: { id: rival } })).status).toBe('EXPIRED');
    expect((await offer(buyerB, listingId, 1)).status).toBe(409);
  });

  it('OFR-05/06: counter-offers alternate turns and the buyer can accept the seller counter', async () => {
    const listingId = await newListing(10);
    const first = (await offer(buyerA, listingId, 4, 70)).body.data.id as string;

    expect((await act(buyerA, first, 'accept')).status).toBe(403);
    expect((await act(outsider, first, 'accept')).status).toBe(404);

    const counter = await act(seller, first, 'counter', { quantity: 4, price: 85 });
    expect(counter.status).toBe(201);
    expect(counter.body.data).toMatchObject({ createdBySellerCounter: true, parentOfferId: first });
    const counterId = counter.body.data.id as string;
    expect((await prisma.offer.findUniqueOrThrow({ where: { id: first } })).status).toBe(
      'COUNTERED',
    );

    expect((await act(seller, counterId, 'accept')).status).toBe(403);
    expect((await act(seller, counterId, 'counter', { quantity: 4, price: 90 })).status).toBe(403);
    expect((await act(seller, first, 'accept')).status).toBe(409);

    const accepted = await act(buyerA, counterId, 'accept');
    expect(accepted.status).toBe(200);
    const order = await prisma.order.findUniqueOrThrow({
      where: { id: accepted.body.data.orderId },
    });
    expect(order.agreedPrice.toString()).toBe('85');
    expect(order.buyerId).toBe(buyerA.id);

    const detail = await request(app).get(`/api/offers/${counterId}`).set(buyerA.auth);
    expect(detail.body.data.history.map((h: { id: string }) => h.id)).toEqual([first]);
    expect((await request(app).get(`/api/offers/${counterId}`).set(outsider.auth)).status).toBe(
      404,
    );
  });

  it('OFR-04/07: reject and withdraw follow the turn rules and are final', async () => {
    const listingId = await newListing(10);
    const a = (await offer(buyerA, listingId, 1)).body.data.id as string;
    expect((await act(seller, a, 'withdraw')).status).toBe(403);
    expect((await act(buyerA, a, 'withdraw')).status).toBe(200);
    expect((await act(seller, a, 'accept')).status).toBe(409);

    const b = (await offer(buyerA, listingId, 1)).body.data.id as string;
    expect((await act(seller, b, 'reject')).status).toBe(200);
    expect((await act(buyerA, b, 'counter', { quantity: 1, price: 50 })).status).toBe(409);
  });

  it('OFR-08: stale pending offers expire and can no longer be accepted', async () => {
    const listingId = await newListing(10);
    const id = (await offer(buyerA, listingId, 2)).body.data.id as string;
    await prisma.offer.update({
      where: { id },
      data: { createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000) },
    });

    expect((await act(seller, id, 'accept')).status).toBe(409);
    expect(await expireStaleOffers()).toBeGreaterThanOrEqual(1);
    expect((await prisma.offer.findUniqueOrThrow({ where: { id } })).status).toBe('EXPIRED');
    expect((await listingState(listingId)).quantityAvailable).toBe(10);
  });

  it('the DB itself refuses negative stock (CHECK constraint backstop)', async () => {
    const listingId = await newListing(2);
    await expect(
      prisma.$executeRaw`UPDATE listings SET "quantityAvailable" = -1 WHERE id = ${listingId}`,
    ).rejects.toThrow();
    expect((await listingState(listingId)).quantityAvailable).toBe(2);
  });
});
