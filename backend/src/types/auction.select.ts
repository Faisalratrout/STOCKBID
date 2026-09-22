import type { Prisma } from '@prisma/client';

export const bidSelect = {
  id: true,
  auctionId: true,
  buyerId: true,
  amount: true,
  createdAt: true,
  buyer: {
    select: { id: true, businessProfile: { select: { companyName: true, logoUrl: true } } },
  },
} satisfies Prisma.BidSelect;

export const auctionDetailSelect = {
  id: true,
  listingId: true,
  startingBid: true,
  minIncrement: true,
  currentBid: true,
  startAt: true,
  endAt: true,
  status: true,
  winningBidId: true,
  createdAt: true,
  updatedAt: true,
  listing: {
    select: {
      id: true,
      title: true,
      sellerId: true,
      status: true,
      quantityTotal: true,
      images: { select: { url: true }, orderBy: { position: 'asc' }, take: 1 },
    },
  },
} satisfies Prisma.AuctionSelect;
