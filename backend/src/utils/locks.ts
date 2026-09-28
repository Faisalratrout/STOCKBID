import type { Prisma } from '@prisma/client';
import { ApiError } from './ApiError';

type Tx = Prisma.TransactionClient;

// Row locks (SELECT ... FOR UPDATE) held until the surrounding transaction ends. When one
// transaction needs both, it must take the auction lock before the listing lock: delist,
// auction close and auction-order cancel all follow that order, so they cannot deadlock.

export const lockAuction = async (tx: Tx, auctionId: string) => {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM auctions WHERE id = ${auctionId} FOR UPDATE`;
  if (rows.length === 0) throw ApiError.notFound('Auction not found');
};

export const lockListing = async (tx: Tx, listingId: string) => {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM listings WHERE id = ${listingId} FOR UPDATE`;
  if (rows.length === 0) throw ApiError.notFound('Listing not found');
};
