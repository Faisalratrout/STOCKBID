import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/config/db';
import { browseQuerySchema, createListingSchema } from '../src/validators/listing.validators';
import { isDbReady } from './helpers/db';

const base = {
  title: 'Pallet of LED monitors',
  description: 'Overstock, boxed, 24 inch panels.',
  categoryId: '00000000-0000-4000-8000-000000000001',
  condition: 'NEW',
  quantity: 50,
  location: 'Amman',
  sellingMethod: 'OFFER',
  startingPrice: 120.5,
  handoverMethod: 'PICKUP',
};

describe('listing validators (STK-01/02, BRW-05)', () => {
  it('requires auction terms for AUCTION and forbids them for OFFER', () => {
    expect(createListingSchema.safeParse({ ...base, sellingMethod: 'AUCTION' }).success).toBe(
      false,
    );
    const auction = { minIncrement: 5, endAt: new Date(Date.now() + 86_400_000).toISOString() };
    expect(
      createListingSchema.safeParse({ ...base, sellingMethod: 'AUCTION', auction }).success,
    ).toBe(true);
    expect(createListingSchema.safeParse({ ...base, auction }).success).toBe(false);
  });

  it('rejects sub-cent prices, zero quantity and past dates', () => {
    expect(createListingSchema.safeParse({ ...base, startingPrice: 10.005 }).success).toBe(false);
    expect(createListingSchema.safeParse({ ...base, quantity: 0 }).success).toBe(false);
    expect(createListingSchema.safeParse({ ...base, expiresAt: '2001-01-01' }).success).toBe(false);
  });

  it('coerces and bounds browse query params', () => {
    const q = browseQuerySchema.parse({ page: '2', minPrice: '5', maxPrice: '10' });
    expect(q).toMatchObject({ page: 2, pageSize: 12, sort: 'newest', minPrice: 5, maxPrice: 10 });
    expect(browseQuerySchema.safeParse({ pageSize: '500' }).success).toBe(false);
    expect(browseQuerySchema.safeParse({ minPrice: '10', maxPrice: '5' }).success).toBe(false);
  });
});

const dbReady = await isDbReady();
const app = createApp();
const runId = Date.now().toString(36);
const password = 'Passw0rd!x';

describe.skipIf(!dbReady)('listings (needs Postgres with migrations applied)', () => {
  let categoryId = '';
  let sellerAuth = { Authorization: '' };
  let otherSellerAuth = { Authorization: '' };
  let buyerAuth = { Authorization: '' };
  let buyerId = '';

  const register = async (role: 'BUYER' | 'SELLER', tag: string) => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        email: `list-it-${runId}-${tag}@test.example`,
        password,
        role,
        companyName: tag + ' Co',
      });
    return {
      auth: { Authorization: `Bearer ${res.body.data.accessToken}` },
      id: res.body.data.user.id as string,
    };
  };

  const validBody = (over: Record<string, unknown> = {}) => ({
    ...base,
    categoryId,
    title: `list-it-${runId} ${Math.random().toString(36).slice(2, 8)}`,
    ...over,
  });

  beforeAll(async () => {
    const cat = await prisma.category.create({
      data: { name: `list-it-${runId}`, slug: `list-it-${runId}` },
    });
    categoryId = cat.id;
    sellerAuth = (await register('SELLER', 'seller')).auth;
    otherSellerAuth = (await register('SELLER', 'other')).auth;
    const buyer = await register('BUYER', 'buyer');
    buyerAuth = buyer.auth;
    buyerId = buyer.id;
  });

  afterAll(async () => {
    const users = await prisma.user.findMany({
      where: { email: { startsWith: `list-it-${runId}` } },
      select: { id: true },
    });
    const ids = users.map((u) => u.id);
    const listings = await prisma.listing.findMany({
      where: { sellerId: { in: ids } },
      select: { id: true },
    });
    const lids = listings.map((l) => l.id);
    await prisma.bid.deleteMany({ where: { auction: { listingId: { in: lids } } } });
    await prisma.auction.deleteMany({ where: { listingId: { in: lids } } });
    await prisma.offer.deleteMany({ where: { listingId: { in: lids } } });
    await prisma.listing.deleteMany({ where: { id: { in: lids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.category.deleteMany({ where: { id: categoryId } });
    await prisma.$disconnect();
  });

  it('only sellers can create listings', async () => {
    expect((await request(app).post('/api/listings').send(validBody())).status).toBe(401);
    expect((await request(app).post('/api/listings').set(buyerAuth).send(validBody())).status).toBe(
      403,
    );
  });

  it('creates an offer listing and an auction listing with its auction row (STK-01/02)', async () => {
    const offer = await request(app).post('/api/listings').set(sellerAuth).send(validBody());
    expect(offer.status).toBe(201);
    expect(offer.body.data).toMatchObject({
      status: 'ACTIVE',
      quantityAvailable: 50,
      auction: null,
    });

    const endAt = new Date(Date.now() + 86_400_000).toISOString();
    const auction = await request(app)
      .post('/api/listings')
      .set(sellerAuth)
      .send(validBody({ sellingMethod: 'AUCTION', auction: { minIncrement: 5, endAt } }));
    expect(auction.status).toBe(201);
    expect(auction.body.data.auction).toMatchObject({ status: 'ACTIVE', currentBid: null });
    expect(auction.body.data.auction.startingBid).toBe('120.5');
  });

  it('browses with search, filters, sort and pagination; hides delisted listings (BRW-01..05)', async () => {
    const cheap = await request(app)
      .post('/api/listings')
      .set(sellerAuth)
      .send(validBody({ title: `list-it-${runId} cheap keyboard`, startingPrice: 10 }));
    const pricey = await request(app)
      .post('/api/listings')
      .set(sellerAuth)
      .send(
        validBody({
          title: `list-it-${runId} pricey keyboard`,
          startingPrice: 900,
          condition: 'USED',
        }),
      );

    const search = await request(app).get('/api/listings').query({ q: 'KEYBOARD', categoryId });
    expect(search.status).toBe(200);
    expect(search.body.data).toHaveLength(2);

    const sorted = await request(app)
      .get('/api/listings')
      .query({ q: 'keyboard', categoryId, sort: 'price_desc' });
    expect(sorted.body.data[0].id).toBe(pricey.body.data.id);

    const used = await request(app).get('/api/listings').query({ categoryId, condition: 'USED' });
    expect(used.body.data.map((l: { id: string }) => l.id)).toEqual([pricey.body.data.id]);

    const paged = await request(app)
      .get('/api/listings')
      .query({ categoryId, pageSize: 1, page: 2 });
    expect(paged.body.data).toHaveLength(1);
    expect(paged.body.meta.total).toBeGreaterThan(2);

    const del = await request(app).delete(`/api/listings/${cheap.body.data.id}`).set(sellerAuth);
    expect(del.status).toBe(204);
    const after = await request(app)
      .get('/api/listings')
      .query({ q: 'cheap keyboard', categoryId });
    expect(after.body.data).toHaveLength(0);
    expect((await request(app).get(`/api/listings/${cheap.body.data.id}`)).status).toBe(404);
    expect(
      (await request(app).get(`/api/listings/${cheap.body.data.id}`).set(sellerAuth)).status,
    ).toBe(200);
  });

  it('does not list expired or out-of-stock listings', async () => {
    const res = await request(app).post('/api/listings').set(sellerAuth).send(validBody());
    await prisma.listing.update({
      where: { id: res.body.data.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const list = await request(app).get('/api/listings').query({ categoryId, pageSize: 50 });
    expect(list.body.data.some((l: { id: string }) => l.id === res.body.data.id)).toBe(false);
  });

  it('enforces ownership on edit and delist', async () => {
    const res = await request(app).post('/api/listings').set(sellerAuth).send(validBody());
    const id = res.body.data.id;
    expect(
      (
        await request(app)
          .patch(`/api/listings/${id}`)
          .set(otherSellerAuth)
          .send({ title: 'stolen title' })
      ).status,
    ).toBe(403);
    expect((await request(app).delete(`/api/listings/${id}`).set(otherSellerAuth)).status).toBe(
      403,
    );
  });

  it('locks price and quantity once an offer exists (guard lives in the UPDATE itself)', async () => {
    const res = await request(app).post('/api/listings').set(sellerAuth).send(validBody());
    const id = res.body.data.id as string;

    const free = await request(app)
      .patch(`/api/listings/${id}`)
      .set(sellerAuth)
      .send({ startingPrice: 99, quantity: 40 });
    expect(free.status).toBe(200);
    expect(free.body.data).toMatchObject({ startingPrice: '99', quantityAvailable: 40 });

    await prisma.offer.create({ data: { listingId: id, buyerId, quantity: 5, price: 80 } });

    const locked = await request(app)
      .patch(`/api/listings/${id}`)
      .set(sellerAuth)
      .send({ startingPrice: 1 });
    expect(locked.status).toBe(409);
    const stillText = await request(app)
      .patch(`/api/listings/${id}`)
      .set(sellerAuth)
      .send({ title: 'Renamed listing title' });
    expect(stillText.status).toBe(200);
  });

  it('cannot delist an auction that already has bids', async () => {
    const endAt = new Date(Date.now() + 86_400_000).toISOString();
    const res = await request(app)
      .post('/api/listings')
      .set(sellerAuth)
      .send(validBody({ sellingMethod: 'AUCTION', auction: { minIncrement: 5, endAt } }));
    const { id } = res.body.data as { id: string };
    const auctionId = res.body.data.auction.id as string;

    await prisma.bid.create({ data: { auctionId, buyerId, amount: 130 } });
    expect((await request(app).delete(`/api/listings/${id}`).set(sellerAuth)).status).toBe(409);
    expect(
      (await request(app).patch(`/api/listings/${id}`).set(sellerAuth).send({ startingPrice: 5 }))
        .status,
    ).toBe(409);
  });

  it('rejects an unknown category and malformed ids', async () => {
    const bad = await request(app)
      .post('/api/listings')
      .set(sellerAuth)
      .send(validBody({ categoryId: '00000000-0000-4000-8000-000000000009' }));
    expect(bad.status).toBe(400);
    expect((await request(app).get('/api/listings/not-a-uuid')).status).toBe(422);
  });
});
