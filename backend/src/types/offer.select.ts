import type { Prisma } from '@prisma/client';

export const offerSelect = {
  id: true,
  listingId: true,
  buyerId: true,
  quantity: true,
  price: true,
  message: true,
  status: true,
  parentOfferId: true,
  createdBySellerCounter: true,
  createdAt: true,
  updatedAt: true,
  listing: {
    select: {
      id: true,
      title: true,
      sellerId: true,
      status: true,
      sellingMethod: true,
      startingPrice: true,
      quantityAvailable: true,
      images: { select: { url: true }, orderBy: { position: 'asc' }, take: 1 },
    },
  },
  buyer: {
    select: { id: true, businessProfile: { select: { companyName: true, logoUrl: true } } },
  },
  order: { select: { id: true } },
} satisfies Prisma.OfferSelect;
