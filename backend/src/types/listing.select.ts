import { Prisma } from '@prisma/client';

const sellerSelect = {
  id: true,
  businessProfile: {
    select: { companyName: true, logoUrl: true, location: true, isVerified: true },
  },
} satisfies Prisma.UserSelect;

/** Compact shape for browse grids / dashboards (BRW-01). */
export const listingCardSelect = {
  id: true,
  title: true,
  condition: true,
  quantityAvailable: true,
  location: true,
  sellingMethod: true,
  startingPrice: true,
  status: true,
  expiresAt: true,
  createdAt: true,
  category: { select: { id: true, name: true, slug: true } },
  images: { select: { url: true }, orderBy: { position: 'asc' }, take: 1 },
  auction: { select: { currentBid: true, endAt: true, status: true } },
  seller: { select: sellerSelect },
} satisfies Prisma.ListingSelect;

/** Full detail page shape (BRW-04). */
export const listingDetailSelect = {
  id: true,
  sellerId: true,
  title: true,
  description: true,
  condition: true,
  quantityTotal: true,
  quantityAvailable: true,
  location: true,
  sellingMethod: true,
  startingPrice: true,
  handoverMethod: true,
  status: true,
  expiresAt: true,
  createdAt: true,
  updatedAt: true,
  category: { select: { id: true, name: true, slug: true } },
  images: { select: { id: true, url: true, position: true }, orderBy: { position: 'asc' } },
  auction: {
    select: {
      id: true,
      startingBid: true,
      minIncrement: true,
      currentBid: true,
      startAt: true,
      endAt: true,
      status: true,
    },
  },
  seller: { select: sellerSelect },
} satisfies Prisma.ListingSelect;
