import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/config/db';
import { closeAuction } from '../src/services/auction.service';
import { placeBidSchema } from '../src/validators/auction.validators';
import { isDbReady } from './helpers/db';

describe('bid validators (AUC-02)', () => {
  it('accepts a positive whole-or-cent amount only', () => {
    expect(placeBidSchema.safeParse({ amount: 150 }).success).toBe(true);
    expect(placeBidSchema.safeParse({ amount: 150.5 }).success).toBe(true);
    expect(placeBidSchema.safeParse({ amount: 150.555 }).success).toBe(false);
    expect(placeBidSchema.safeParse({ amount: 0 }).success).toBe(false);
    expect(placeBidSchema.safeParse({ amount: -10 }).success).toBe(false);
  });
});

const dbReady = await isDbReady();
const app = createApp();
const runId = Date.now().toString(36);
const password = 'Passw0rd!x';

type Session = { auth: { Authorization: string }; id: string };

describe.skipIf(!dbReady)('auctions (needs Postgres with migrations applied)', () => {
  let categoryId = '';
  let seller: Session;
  let buyerA: Session;
  let buyerB: Session;
  let outsiderSeller: Session;

  const register = async (role: 'BUYER' | 'SELLER', tag: string): Promise<Session> => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        email: `auc-it-${runId}-${tag}@test.example`,
        password,
        role,
        companyName: `${tag} Co`,
      });
    return {
      auth: { Authorization: `Bearer ${res.body.data.accessToken}` },
      id: res.body.data.user.id,
    };
  };

  const newAuctionListing = async (
    quantity: number,
    minIncrement: number,
    startingPrice = 100,
    endAtMs = Date.now() + 86_400_000,
  ) => {
    const res = await request(app)
      .post('/api/listings')
      .set(seller.auth)
      .send({
        title: `auc-it-${runId} lot`,
        description: 'Overstock pallet sold at auction',
        categoryId,
        condition: 'NEW',
        quantity,
        location: 'Amman',
        sellingMethod: 'AUCTION',
        startingPrice,
        handoverMethod: 'PICKUP',
        auction: { minIncrement, endAt: new Date(endAtMs).toISOString() },
      });
    return {
      listingId: res.body.data.id as string,
      auctionId: res.body.data.auction.id as string,
    };
  };

  const bid = (s: Session, auctionId: string, amount: number) =>
    request(app).post(`/api/auctions/${auctionId}/bids`).set(s.auth).send({ amount });

  const auctionState = (id: string) =>
    prisma.auction.findUniqueOrThrow({
      where: { id },
      select: { currentBid: true, status: true, winningBidId: true },
    });

  beforeAll(async () => {
    categoryId = (
      await prisma.category.create({ data: { name: `auc-it-${runId}`, slug: `auc-it-${runId}` } })
    ).id;
    [seller, buyerA, buyerB, outsiderSeller] = await Promise.all([
      register('SELLER', 'seller'),
      register('BUYER', 'buyerA'),
      register('BUYER', 'buyerB'),
      register('SELLER', 'outsider'),
    ]);
  });

  afterAll(async () => {
    const users = await prisma.user.findMany({
      where: { email: { startsWith: `auc-it-${runId}` } },
      select: { id: true },
    });
    const ids = users.map((u) => u.id);
    const listings = await prisma.listing.findMany({
      where: { sellerId: { in: ids } },
      select: { id: true },
    });
    const lids = listings.map((l) => l.id);
    const auctions = await prisma.auction.findMany({
      where: { listingId: { in: lids } },
      select: { id: true },
    });
    const aids = auctions.map((a) => a.id);
    await prisma.order.deleteMany({ where: { listingId: { in: lids } } });
    await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
    await prisma.bid.deleteMany({ where: { auctionId: { in: aids } } });
    await prisma.auction.updateMany({ where: { id: { in: aids } }, data: { winningBidId: null } });
    await prisma.auction.deleteMany({ where: { id: { in: aids } } });
    await prisma.listing.deleteMany({ where: { id: { in: lids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.category.deleteMany({ where: { id: categoryId } });
    await prisma.$disconnect();
  });

  it('AUC-02: rejects a bid below the starting price, accepts one at or above it', async () => {
    const { auctionId } = await newAuctionListing(3, 5, 100);
    expect((await bid(buyerA, auctionId, 99)).status).toBe(400);
    const res = await bid(buyerA, auctionId, 100);
    expect(res.status).toBe(200);
    expect(res.body.data.currentBid).toBe('100');
    expect(await auctionState(auctionId)).toMatchObject({ currentBid: expect.anything() });
  });

  it('AUC-02: a listing seller (SELLER role) cannot bid at all', async () => {
    const { auctionId } = await newAuctionListing(2, 5, 50);
    expect((await bid(outsiderSeller, auctionId, 50)).status).toBe(403);
    expect((await bid(seller, auctionId, 50)).status).toBe(403);
  });

  it('AUC-02: a bid must beat the current leader by at least minIncrement', async () => {
    const { auctionId } = await newAuctionListing(2, 10, 50);
    expect((await bid(buyerA, auctionId, 50)).status).toBe(200);
    expect((await bid(buyerB, auctionId, 55)).status).toBe(400);
    const res = await bid(buyerB, auctionId, 60);
    expect(res.status).toBe(200);
    expect(res.body.data.currentBid).toBe('60');
  });

  it('AUC-02/AUC-07: outbidding the leader notifies them', async () => {
    const { auctionId } = await newAuctionListing(2, 10, 50);
    await bid(buyerA, auctionId, 50);
    await bid(buyerB, auctionId, 60);
    const notes = await prisma.notification.findMany({
      where: { userId: buyerA.id, type: 'OUTBID', relatedEntityId: auctionId },
    });
    expect(notes).toHaveLength(1);
  });

  it('AUC-03: bid history is newest-first and includes the per-unit equivalent', async () => {
    const { auctionId } = await newAuctionListing(4, 10, 40);
    await bid(buyerA, auctionId, 40);
    await bid(buyerB, auctionId, 50);
    const res = await request(app)
      .get(`/api/auctions/${auctionId}/bids`)
      .set(seller.auth);
    expect(res.body.data.map((b: { amount: string }) => b.amount)).toEqual(['50', '40']);
    expect(res.body.data[0].amountPerUnit).toBe('12.5');
  });

  it('AUC-02: two buyers bidding the same amount at the exact same time: exactly one wins', async () => {
    const { auctionId } = await newAuctionListing(2, 5, 100);
    const results = await Promise.all([bid(buyerA, auctionId, 100), bid(buyerB, auctionId, 100)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
    expect(await prisma.bid.count({ where: { auctionId } })).toBe(1);
    expect((await auctionState(auctionId)).currentBid?.toString()).toBe('100');
  });

  it('AUC-02: bidding on an auction past its end time is rejected', async () => {
    const { auctionId } = await newAuctionListing(1, 5, 100, Date.now() + 500);
    await new Promise((r) => setTimeout(r, 600));
    expect((await bid(buyerA, auctionId, 100)).status).toBe(409);
  });

  it('AUC-05/06/07: closing an auction with bids creates an order at amount/quantity, sells out the listing, notifies everyone', async () => {
    const { listingId, auctionId } = await newAuctionListing(4, 10, 40);
    await bid(buyerA, auctionId, 40);
    await bid(buyerB, auctionId, 80);

    await closeAuction(auctionId);

    const state = await auctionState(auctionId);
    expect(state.status).toBe('ENDED');
    expect(state.winningBidId).not.toBeNull();

    const order = await prisma.order.findFirstOrThrow({ where: { auctionId } });
    expect(order).toMatchObject({
      buyerId: buyerB.id,
      sellerId: seller.id,
      sourceType: 'AUCTION',
      quantity: 4,
    });
    expect(order.agreedPrice.toString()).toBe('20');

    const listing = await prisma.listing.findUniqueOrThrow({
      where: { id: listingId },
      select: { status: true, quantityAvailable: true },
    });
    expect(listing).toEqual({ status: 'SOLD', quantityAvailable: 0 });

    expect(
      await prisma.notification.count({
        where: { userId: buyerB.id, type: 'AUCTION_ENDED', relatedEntityId: order.id },
      }),
    ).toBe(1);
    expect(
      await prisma.notification.count({
        where: { userId: buyerA.id, type: 'AUCTION_ENDED' },
      }),
    ).toBeGreaterThanOrEqual(1);
  });

  it('AUC-05: closing the same auction twice at once creates exactly one order (idempotent under the row lock)', async () => {
    const { auctionId } = await newAuctionListing(2, 10, 50);
    await bid(buyerA, auctionId, 50);

    const results = await Promise.allSettled([closeAuction(auctionId), closeAuction(auctionId)]);
    expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
    expect(await prisma.order.count({ where: { auctionId } })).toBe(1);
    expect((await auctionState(auctionId)).status).toBe('ENDED');
  });

  it('AUC-05: closing an auction with no bids ends it without creating an order', async () => {
    const { auctionId } = await newAuctionListing(1, 5, 30);
    await closeAuction(auctionId);
    expect((await auctionState(auctionId)).status).toBe('ENDED');
    expect(await prisma.order.count({ where: { auctionId } })).toBe(0);
    expect(
      await prisma.notification.count({
        where: { userId: seller.id, type: 'AUCTION_ENDED', relatedEntityId: auctionId },
      }),
    ).toBe(1);
  });
});
