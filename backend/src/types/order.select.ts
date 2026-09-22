import type { Prisma } from '@prisma/client';

export const orderSelect = {
  id: true,
  listingId: true,
  buyerId: true,
  sellerId: true,
  sourceType: true,
  offerId: true,
  auctionId: true,
  quantity: true,
  agreedPrice: true,
  handoverMethod: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  fulfilledAt: true,
  completedAt: true,
  listing: {
    select: {
      id: true,
      title: true,
      images: { select: { url: true }, orderBy: { position: 'asc' }, take: 1 },
    },
  },
  buyer: {
    select: { id: true, businessProfile: { select: { companyName: true } } },
  },
  seller: {
    select: { id: true, businessProfile: { select: { companyName: true } } },
  },
} satisfies Prisma.OrderSelect;
