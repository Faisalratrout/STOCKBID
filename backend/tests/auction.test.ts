import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/config/db';
import { auctionCloseQueue } from '../src/jobs/auctionClose.job';
import { closeAuction, sweepOverdueAuctions } from '../src/services/auction.service';
import { placeBidSchema } from '../src/validators/auction.validators';
import { isDbReady } from './helpers/db';
import { markEmailVerified } from './helpers/users';

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

  const register = async (
    role: 'BUYER' | 'SELLER',
    tag: string,
    verified = true,
  ): Promise<Session> => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        email: `auc-it-${runId}-${tag}@test.example`,
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
    const res = await request(app).get(`/api/auctions/${auctionId}/bids`).set(seller.auth);
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

  const delist = (listingId: string) =>
    request(app).delete(`/api/listings/${listingId}`).set(seller.auth);

  const listingStatus = async (id: string) =>
    (await prisma.listing.findUniqueOrThrow({ where: { id }, select: { status: true } })).status;

  it('STK-04/AUC-02: delisting an auction ends it, so it rejects later bids', async () => {
    const { listingId, auctionId } = await newAuctionListing(2, 5, 100);
    expect((await delist(listingId)).status).toBe(204);
    expect((await auctionState(auctionId)).status).toBe('ENDED');
    expect((await bid(buyerA, auctionId, 100)).status).toBe(409);
    expect(await prisma.bid.count({ where: { auctionId } })).toBe(0);
  });

  it('AUC-02: an ACTIVE auction whose listing is not ACTIVE rejects bids', async () => {
    const { listingId, auctionId } = await newAuctionListing(2, 5, 100);
    // State left behind by the old delist path, which did not end the auction.
    await prisma.listing.update({ where: { id: listingId }, data: { status: 'DELISTED' } });
    expect((await bid(buyerA, auctionId, 100)).status).toBe(409);
  });

  it('AUC-05: closing an auction whose listing was delisted never sells it', async () => {
    const { listingId, auctionId } = await newAuctionListing(2, 5, 100);
    await bid(buyerA, auctionId, 100);
    await prisma.listing.update({ where: { id: listingId }, data: { status: 'DELISTED' } });

    await closeAuction(auctionId);

    expect((await auctionState(auctionId)).status).toBe('ENDED');
    expect(await prisma.order.count({ where: { auctionId } })).toBe(0);
    expect(await listingStatus(listingId)).toBe('DELISTED');
  });

  it('STK-04/AUC-02: a delist racing a first bid: exactly one of them wins', async () => {
    for (let i = 0; i < 5; i++) {
      const { listingId, auctionId } = await newAuctionListing(2, 5, 100);
      const [d, b] = await Promise.all([delist(listingId), bid(buyerA, auctionId, 100)]);
      const bids = await prisma.bid.count({ where: { auctionId } });
      const status = await listingStatus(listingId);

      if (d.status === 204) {
        expect(b.status).toBe(409);
        expect(bids).toBe(0);
        expect(status).toBe('DELISTED');
      } else {
        expect(d.status).toBe(409);
        expect(b.status).toBe(200);
        expect(bids).toBe(1);
        expect(status).toBe('ACTIVE');
      }
    }
  });

  it('AUC-02/05: the highest amount leads even when its createdAt is older (clock skew)', async () => {
    const { auctionId } = await newAuctionListing(2, 10, 50);
    const now = Date.now();
    // Simulate two API servers with skewed clocks: the higher bid got the earlier timestamp.
    await prisma.bid.create({
      data: { auctionId, buyerId: buyerA.id, amount: 60, createdAt: new Date(now - 5_000) },
    });
    await prisma.bid.create({
      data: { auctionId, buyerId: buyerB.id, amount: 50, createdAt: new Date(now) },
    });
    await prisma.auction.update({ where: { id: auctionId }, data: { currentBid: 60 } });

    // The outbid notification must go to the real leader (buyerA), not the latest-stamped bidder.
    expect((await bid(buyerB, auctionId, 70)).status).toBe(200);
    expect(
      await prisma.notification.count({
        where: { userId: buyerA.id, type: 'OUTBID', relatedEntityId: auctionId },
      }),
    ).toBe(1);

    await prisma.bid.create({
      data: { auctionId, buyerId: buyerA.id, amount: 80, createdAt: new Date(now - 10_000) },
    });
    await prisma.auction.update({ where: { id: auctionId }, data: { currentBid: 80 } });
    await closeAuction(auctionId);

    const order = await prisma.order.findFirstOrThrow({ where: { auctionId } });
    expect(order.buyerId).toBe(buyerA.id);
    expect(order.agreedPrice.toString()).toBe('40');
  });

  it('AUC-05: the close job is queued with retries and exponential backoff', async () => {
    const add = vi.spyOn(auctionCloseQueue, 'add');
    try {
      const { auctionId } = await newAuctionListing(1, 5, 30);
      expect(add).toHaveBeenCalledWith(
        'close',
        { auctionId },
        expect.objectContaining({
          jobId: auctionId,
          attempts: 5,
          backoff: { type: 'exponential', delay: 5_000 },
        }),
      );
    } finally {
      add.mockRestore();
    }
  });

  it('AUC-01: a queue failure after commit still returns 201 and leaves the auction for the sweep', async () => {
    const add = vi
      .spyOn(auctionCloseQueue, 'add')
      .mockRejectedValueOnce(new Error('Redis unavailable'));
    try {
      const { listingId, auctionId } = await newAuctionListing(1, 5, 30);
      expect(listingId).toBeTruthy();
      expect((await auctionState(auctionId)).status).toBe('ACTIVE');
    } finally {
      add.mockRestore();
    }
  });

  it('AUC-05: the sweep closes an overdue auction whose job never ran, and overlapping sweeps create one order', async () => {
    const { listingId, auctionId } = await newAuctionListing(2, 5, 100, Date.now() + 700);
    expect((await bid(buyerA, auctionId, 100)).status).toBe(200);
    await new Promise((r) => setTimeout(r, 800));

    await Promise.all([sweepOverdueAuctions(), sweepOverdueAuctions()]);

    expect((await auctionState(auctionId)).status).toBe('ENDED');
    expect(await prisma.order.count({ where: { auctionId } })).toBe(1);
    expect(await listingStatus(listingId)).toBe('SOLD');
    // A later sweep finds nothing left to do for it.
    await sweepOverdueAuctions();
    expect(await prisma.order.count({ where: { auctionId } })).toBe(1);
  });

  it('ORD-01: an auction order total is the winning bid itself, even when the per-unit split rounds', async () => {
    // 100.00 / 3 = 33.33 per unit, and 3 * 33.33 = 99.99: the total must stay 100.00.
    const { auctionId } = await newAuctionListing(3, 5, 100);
    expect((await bid(buyerA, auctionId, 100)).status).toBe(200);
    await closeAuction(auctionId);

    const order = await prisma.order.findFirstOrThrow({ where: { auctionId } });
    expect(order.agreedPrice.toString()).toBe('33.33');
    expect(order.totalPrice.toString()).toBe('100');

    const res = await request(app).get(`/api/orders/${order.id}`).set(buyerA.auth);
    expect(res.body.data.totalPrice).toBe('100');
  });

  it('ORD-01: a rounding-up split does not overcharge: 1000.00 for 7 units totals 1000.00', async () => {
    const { auctionId } = await newAuctionListing(7, 5, 1000);
    expect((await bid(buyerA, auctionId, 1000)).status).toBe(200);
    await closeAuction(auctionId);

    const order = await prisma.order.findFirstOrThrow({ where: { auctionId } });
    expect(order.agreedPrice.toString()).toBe('142.86');
    expect(order.totalPrice.toString()).toBe('1000');
  });

  it('ORD-04: cancelling an auction order restocks, reopens the listing and cancels that auction for good', async () => {
    const { listingId, auctionId } = await newAuctionListing(3, 5, 100);
    await bid(buyerA, auctionId, 100);
    await bid(buyerB, auctionId, 120);
    await closeAuction(auctionId);
    const order = await prisma.order.findFirstOrThrow({ where: { auctionId } });

    const res = await request(app)
      .patch(`/api/orders/${order.id}/status`)
      .set(buyerB.auth)
      .send({ status: 'CANCELLED' });
    expect(res.status).toBe(200);

    expect(
      await prisma.listing.findUniqueOrThrow({
        where: { id: listingId },
        select: { status: true, quantityAvailable: true },
      }),
    ).toEqual({ status: 'ACTIVE', quantityAvailable: 3 });
    expect((await auctionState(auctionId)).status).toBe('CANCELLED');

    // The old auction cannot be resumed: no bids, and neither the close job nor the sweep
    // can produce a second order from its old bids.
    expect((await bid(buyerA, auctionId, 200)).status).toBe(409);
    await closeAuction(auctionId);
    await sweepOverdueAuctions();
    expect(await prisma.order.count({ where: { auctionId } })).toBe(1);
    expect((await auctionState(auctionId)).status).toBe('CANCELLED');
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

  it('AUTH-04: an unverified buyer cannot bid', async () => {
    const unverified = await register('BUYER', 'unverified', false);
    const { auctionId } = await newAuctionListing(1, 5, 100);
    const res = await bid(unverified, auctionId, 100);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('EMAIL_NOT_VERIFIED');
    expect(await prisma.bid.count({ where: { auctionId } })).toBe(0);
  });

  // STK-02 relist: a fresh auction on a listing whose last one was cancelled or ended unsold.
  const relist = (listingId: string, body: object, s: Session = seller) =>
    request(app).post(`/api/listings/${listingId}/auctions`).set(s.auth).send(body);

  const inADay = () => new Date(Date.now() + 86_400_000).toISOString();

  const cancelledAuctionListing = async () => {
    const { listingId, auctionId } = await newAuctionListing(3, 5, 100);
    await bid(buyerA, auctionId, 100);
    await closeAuction(auctionId);
    const order = await prisma.order.findFirstOrThrow({ where: { auctionId } });
    await request(app)
      .patch(`/api/orders/${order.id}/status`)
      .set(buyerA.auth)
      .send({ status: 'CANCELLED' });
    return { listingId, auctionId, orderId: order.id };
  };

  it('STK-02: after a cancelled auction order the seller can relist at a new price, and the listing is browsable again', async () => {
    const { listingId, auctionId: oldAuctionId } = await cancelledAuctionListing();
    const endAt = inADay();

    const res = await relist(listingId, { minIncrement: 2, endAt, startingPrice: 80 });
    expect(res.status).toBe(201);
    const newAuctionId = res.body.data.auction.id as string;
    expect(newAuctionId).not.toBe(oldAuctionId);
    expect(res.body.data.auction).toMatchObject({
      status: 'ACTIVE',
      startingBid: '80',
      minIncrement: '2',
      currentBid: null,
    });
    expect(res.body.data).toMatchObject({
      startingPrice: '80',
      status: 'ACTIVE',
      expiresAt: endAt,
    });
    expect((await auctionState(oldAuctionId)).status).toBe('CANCELLED');

    const browse = await request(app).get('/api/listings').query({ categoryId });
    expect(browse.body.data.map((l: { id: string }) => l.id)).toContain(listingId);
  });

  it('STK-02: the relisted auction sells normally while the old auction and its cancelled order stay untouched', async () => {
    const {
      listingId,
      auctionId: oldAuctionId,
      orderId: oldOrderId,
    } = await cancelledAuctionListing();
    const newAuctionId = (await relist(listingId, { minIncrement: 5, endAt: inADay() })).body.data
      .auction.id as string;

    expect((await bid(buyerB, oldAuctionId, 500)).status).toBe(409);
    expect((await bid(buyerB, newAuctionId, 100)).status).toBe(200);
    await closeAuction(newAuctionId);

    const newOrder = await prisma.order.findFirstOrThrow({ where: { auctionId: newAuctionId } });
    expect(newOrder).toMatchObject({ buyerId: buyerB.id, quantity: 3, status: 'PENDING' });
    expect(newOrder.totalPrice.toString()).toBe('100');
    expect(
      await prisma.order.findUniqueOrThrow({
        where: { id: oldOrderId },
        select: { status: true, auctionId: true },
      }),
    ).toEqual({ status: 'CANCELLED', auctionId: oldAuctionId });
    expect(await listingStatus(listingId)).toBe('SOLD');
  });

  it('STK-02: an auction that ended with no bids can be relisted, keeping the price when none is given', async () => {
    const { listingId, auctionId } = await newAuctionListing(2, 5, 70);
    await closeAuction(auctionId);
    expect((await auctionState(auctionId)).status).toBe('ENDED');

    const res = await relist(listingId, { minIncrement: 5, endAt: inADay() });
    expect(res.status).toBe(201);
    expect(res.body.data.auction).toMatchObject({ status: 'ACTIVE', startingBid: '70' });
    expect(res.body.data.startingPrice).toBe('70');
  });

  it('STK-02/AUC-01: relisting queues a close job for the new auction', async () => {
    const { listingId } = await cancelledAuctionListing();
    const add = vi.spyOn(auctionCloseQueue, 'add');
    try {
      const res = await relist(listingId, { minIncrement: 5, endAt: inADay() });
      expect(res.status).toBe(201);
      expect(add).toHaveBeenCalledWith(
        'close',
        { auctionId: res.body.data.auction.id },
        expect.objectContaining({ jobId: res.body.data.auction.id }),
      );
    } finally {
      add.mockRestore();
    }
  });

  it('STK-02: relisting is refused while the auction is live, sold or delisted, and for offer listings', async () => {
    const body = { minIncrement: 5, endAt: inADay() };

    const live = await newAuctionListing(1, 5, 100);
    expect((await relist(live.listingId, body)).status).toBe(409);

    // Sold: the order is still PENDING, so the lot is not back in stock.
    const sold = await newAuctionListing(1, 5, 100);
    await bid(buyerA, sold.auctionId, 100);
    await closeAuction(sold.auctionId);
    expect((await relist(sold.listingId, body)).status).toBe(409);

    // Delisting ends the auction with no winner, but the listing is no longer ACTIVE.
    const delisted = await newAuctionListing(1, 5, 100);
    const del = await request(app).delete(`/api/listings/${delisted.listingId}`).set(seller.auth);
    expect(del.status).toBe(204);
    expect((await relist(delisted.listingId, body)).status).toBe(409);

    const offer = await request(app)
      .post('/api/listings')
      .set(seller.auth)
      .send({
        title: `auc-it-${runId} offer lot`,
        description: 'Overstock pallet sold by offer',
        categoryId,
        condition: 'NEW',
        quantity: 1,
        location: 'Amman',
        sellingMethod: 'OFFER',
        startingPrice: 100,
        handoverMethod: 'PICKUP',
      });
    expect((await relist(offer.body.data.id, body)).status).toBe(409);

    expect(await prisma.auction.count({ where: { listingId: live.listingId } })).toBe(1);
    expect(await prisma.auction.count({ where: { listingId: sold.listingId } })).toBe(1);
    expect(await prisma.auction.count({ where: { listingId: delisted.listingId } })).toBe(1);
  });

  it('STK-02: only the verified owning seller can relist, with a future end time', async () => {
    const { listingId } = await cancelledAuctionListing();
    const body = { minIncrement: 5, endAt: inADay() };

    expect((await relist(listingId, body, outsiderSeller)).status).toBe(403);
    expect((await relist(listingId, body, buyerA)).status).toBe(403);
    const past = await relist(listingId, {
      minIncrement: 5,
      endAt: new Date(Date.now() - 60_000).toISOString(),
    });
    expect(past.status).toBe(422);

    await prisma.user.update({ where: { id: seller.id }, data: { isEmailVerified: false } });
    try {
      const unverified = await relist(listingId, body);
      expect(unverified.status).toBe(403);
      expect(unverified.body.error.code).toBe('EMAIL_NOT_VERIFIED');
    } finally {
      await markEmailVerified(seller.id);
    }

    expect(await prisma.auction.count({ where: { listingId } })).toBe(1);
  });

  it('STK-02: two relists at the same time: exactly one new auction is created', async () => {
    const { listingId } = await cancelledAuctionListing();
    const body = { minIncrement: 5, endAt: inADay() };

    const results = await Promise.all([relist(listingId, body), relist(listingId, body)]);

    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await prisma.auction.count({ where: { listingId } })).toBe(2);
    expect(await prisma.auction.count({ where: { listingId, status: 'ACTIVE' } })).toBe(1);
    const winner = results.find((r) => r.status === 201)!;
    const { auctionId } = await prisma.listing.findUniqueOrThrow({
      where: { id: listingId },
      select: { auctionId: true },
    });
    expect(auctionId).toBe(winner.body.data.auction.id);
  });

  it('STK-04: delisting a relisted listing ends its new auction, which then rejects bids', async () => {
    const { listingId } = await cancelledAuctionListing();
    const newAuctionId = (await relist(listingId, { minIncrement: 5, endAt: inADay() })).body.data
      .auction.id as string;

    const del = await request(app).delete(`/api/listings/${listingId}`).set(seller.auth);
    expect(del.status).toBe(204);
    expect((await auctionState(newAuctionId)).status).toBe('ENDED');
    expect((await bid(buyerA, newAuctionId, 100)).status).toBe(409);
  });

  it('STK-04: a listing whose auction order was cancelled can be delisted despite the old bids', async () => {
    const { listingId, auctionId } = await cancelledAuctionListing();
    expect(await prisma.bid.count({ where: { auctionId } })).toBe(1);

    expect((await delist(listingId)).status).toBe(204);
    expect(await listingStatus(listingId)).toBe('DELISTED');
    expect((await auctionState(auctionId)).status).toBe('CANCELLED');
    expect((await relist(listingId, { minIncrement: 5, endAt: inADay() })).status).toBe(409);
  });
});
