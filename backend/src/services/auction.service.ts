import type { Auction, Listing, Prisma } from '@prisma/client';
import { prisma } from '../config/db';
import { ApiError } from '../utils/ApiError';
import { pageMeta } from '../utils/ApiResponse';
import { perUnit } from '../utils/money';
import type { AuthUser } from '../types/express';
import type { AuctionView, BidView, Paginated } from '../types/dto';
import { auctionDetailSelect, bidSelect } from '../types/auction.select';
import type { BidListQuery, PlaceBidInput } from '../validators/auction.validators';
import { createNotification } from './notification.service';
import { createOrderFromAuction } from './order.service';
import { scheduleAuctionClose } from '../jobs/auctionClose.job';
import { emitAuctionEnded, emitNewBid, emitOutbid } from '../sockets/emitter';

type Tx = Prisma.TransactionClient;
type AuctionWithListing = Auction & { listing: Listing };

// Same discipline as offer.service's lockListing: every state change on an auction's bids
// takes this row lock first, so the "is this still the highest bid" check and the write that
// follows it can never be split by a concurrent bid or the close job.
const lockAuction = async (tx: Tx, auctionId: string) => {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM auctions WHERE id = ${auctionId} FOR UPDATE`;
  if (rows.length === 0) throw ApiError.notFound('Auction not found');
};

const loadAuction = async (tx: Tx, auctionId: string): Promise<AuctionWithListing> =>
  tx.auction.findUniqueOrThrow({ where: { id: auctionId }, include: { listing: true } });

const withPerUnit = (
  auction: Prisma.AuctionGetPayload<{ select: typeof auctionDetailSelect }>,
): AuctionView => ({
  ...auction,
  startingBidPerUnit: perUnit(auction.startingBid, auction.listing.quantityTotal),
  currentBidPerUnit: auction.currentBid
    ? perUnit(auction.currentBid, auction.listing.quantityTotal)
    : null,
});

const view = async (id: string): Promise<AuctionView> =>
  withPerUnit(await prisma.auction.findUniqueOrThrow({ where: { id }, select: auctionDetailSelect }));

/** AUC-01: called right after an auction listing is created. */
export const onAuctionCreated = (auctionId: string, endAt: Date) =>
  scheduleAuctionClose(auctionId, endAt);

export const getAuction = (id: string) => view(id);

/** AUC-03 */
export const listBids = async (
  auctionId: string,
  query: BidListQuery,
): Promise<Paginated<BidView>> => {
  const exists = await prisma.auction.findUnique({ where: { id: auctionId }, select: { id: true } });
  if (!exists) throw ApiError.notFound('Auction not found');

  const where = { auctionId };
  const [total, auctionQty, rows] = await prisma.$transaction([
    prisma.bid.count({ where }),
    prisma.auction.findUniqueOrThrow({
      where: { id: auctionId },
      select: { listing: { select: { quantityTotal: true } } },
    }),
    prisma.bid.findMany({
      where,
      select: bidSelect,
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);
  const quantityTotal = auctionQty.listing.quantityTotal;
  const items = rows.map((b) => ({ ...b, amountPerUnit: perUnit(b.amount, quantityTotal) }));
  return { items, meta: pageMeta(query.page, query.pageSize, total) };
};

/**
 * AUC-02. `amount` is the total price for the whole lot. Must beat the current leader (or the
 * starting bid, if none yet) by at least `minIncrement`. The minimum-bid check and the write
 * that raises `currentBid` happen under the same lock, so two bids racing for the same "beats
 * the current leader" window cannot both win.
 */
export const placeBid = async (
  auctionId: string,
  buyer: AuthUser,
  input: PlaceBidInput,
): Promise<AuctionView> => {
  const result = await prisma.$transaction(async (tx) => {
    await lockAuction(tx, auctionId);
    const auction = await loadAuction(tx, auctionId);

    if (auction.status !== 'ACTIVE' || auction.endAt <= new Date()) {
      throw ApiError.conflict('This auction is no longer accepting bids');
    }

    const minimum = auction.currentBid
      ? auction.currentBid.add(auction.minIncrement)
      : auction.startingBid;
    if (input.amount < Number(minimum)) {
      throw ApiError.badRequest(`Minimum bid is ${minimum.toString()}`);
    }

    const previousLeader = await tx.bid.findFirst({
      where: { auctionId },
      orderBy: { createdAt: 'desc' },
      select: { buyerId: true },
    });

    await tx.bid.create({ data: { auctionId, buyerId: buyer.id, amount: input.amount } });
    await tx.auction.update({ where: { id: auctionId }, data: { currentBid: input.amount } });

    if (previousLeader && previousLeader.buyerId !== buyer.id) {
      await createNotification(
        {
          userId: previousLeader.buyerId,
          type: 'OUTBID',
          message: `You've been outbid on "${auction.listing.title}": new bid ${input.amount}`,
          relatedEntityType: 'AUCTION',
          relatedEntityId: auctionId,
        },
        tx,
      );
    }
    return { outbidBuyerId: previousLeader?.buyerId };
  });

  const auctionView = await view(auctionId);
  emitNewBid(auctionId, auctionView);
  if (result.outbidBuyerId && result.outbidBuyerId !== buyer.id) {
    emitOutbid(result.outbidBuyerId, { auctionId, newBid: auctionView.currentBid });
  }
  return auctionView;
};

type CloseResult = { auctionId: string; endedAt: boolean };

/**
 * AUC-05/06/07. Invoked by the close-job worker (and safe to invoke more than once for the
 * same auction — e.g. a retried job): the row lock means the second caller sees `status`
 * already `ENDED` and returns immediately, so at most one order is ever created.
 */
export const closeAuction = async (auctionId: string): Promise<CloseResult> => {
  const outcome = await prisma.$transaction(async (tx) => {
    await lockAuction(tx, auctionId);
    const auction = await loadAuction(tx, auctionId);
    if (auction.status !== 'ACTIVE') return { alreadyClosed: true as const };

    const winningBid = await tx.bid.findFirst({
      where: { auctionId },
      orderBy: { createdAt: 'desc' },
    });

    if (!winningBid) {
      await tx.auction.update({ where: { id: auctionId }, data: { status: 'ENDED' } });
      await createNotification(
        {
          userId: auction.listing.sellerId,
          type: 'AUCTION_ENDED',
          message: `Your auction for "${auction.listing.title}" ended with no bids`,
          relatedEntityType: 'AUCTION',
          relatedEntityId: auctionId,
        },
        tx,
      );
      return { alreadyClosed: false as const, winner: null };
    }

    const quantity = auction.listing.quantityTotal;
    const agreedPrice = perUnit(winningBid.amount, quantity);

    await tx.auction.update({
      where: { id: auctionId },
      data: { status: 'ENDED', winningBidId: winningBid.id },
    });

    const { count } = await tx.listing.updateMany({
      where: { id: auction.listingId, quantityAvailable: { gte: quantity } },
      data: { quantityAvailable: { decrement: quantity }, status: 'SOLD' },
    });
    if (count !== 1) throw ApiError.conflict('Listing stock changed unexpectedly at auction close');

    const order = await createOrderFromAuction(tx, {
      listingId: auction.listingId,
      buyerId: winningBid.buyerId,
      sellerId: auction.listing.sellerId,
      auctionId,
      quantity,
      agreedPrice,
      handoverMethod: auction.listing.handoverMethod,
    });

    const losers = await tx.bid.findMany({
      where: { auctionId, buyerId: { not: winningBid.buyerId } },
      distinct: ['buyerId'],
      select: { buyerId: true },
    });

    await createNotification(
      {
        userId: winningBid.buyerId,
        type: 'AUCTION_ENDED',
        message: `You won the auction for "${auction.listing.title}": ${winningBid.amount.toString()} total (${agreedPrice.toString()}/unit)`,
        relatedEntityType: 'ORDER',
        relatedEntityId: order.id,
      },
      tx,
    );
    await createNotification(
      {
        userId: auction.listing.sellerId,
        type: 'AUCTION_ENDED',
        message: `Your auction for "${auction.listing.title}" sold for ${winningBid.amount.toString()}`,
        relatedEntityType: 'ORDER',
        relatedEntityId: order.id,
      },
      tx,
    );
    for (const { buyerId } of losers) {
      await createNotification(
        {
          userId: buyerId,
          type: 'AUCTION_ENDED',
          message: `The auction for "${auction.listing.title}" has ended; you did not win`,
          relatedEntityType: 'AUCTION',
          relatedEntityId: auctionId,
        },
        tx,
      );
    }

    return { alreadyClosed: false as const, winner: winningBid.buyerId };
  });

  if (!outcome.alreadyClosed) emitAuctionEnded(auctionId, { auctionId, winner: outcome.winner });
  return { auctionId, endedAt: !outcome.alreadyClosed };
};
