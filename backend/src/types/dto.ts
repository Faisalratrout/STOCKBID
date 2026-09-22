import type { Prisma, Role } from '@prisma/client';
import type { PageMeta } from '../utils/ApiResponse';
import type { listingCardSelect, listingDetailSelect } from './listing.select';
import type { offerSelect } from './offer.select';
import type { auctionDetailSelect, bidSelect } from './auction.select';
import type { orderSelect } from './order.select';

export type OfferView = Prisma.OfferGetPayload<{ select: typeof offerSelect }>;

// AUC-02: amounts are the total lot price. *PerUnit fields divide by the listing's
// quantityTotal so sellers/admins can read either total or per-unit at a glance.
export type BidView = Prisma.BidGetPayload<{ select: typeof bidSelect }> & {
  amountPerUnit: Prisma.Decimal;
};
export type AuctionView = Prisma.AuctionGetPayload<{ select: typeof auctionDetailSelect }> & {
  startingBidPerUnit: Prisma.Decimal;
  currentBidPerUnit: Prisma.Decimal | null;
};

export type OrderView = Prisma.OrderGetPayload<{ select: typeof orderSelect }>;

export type ListingCard = Prisma.ListingGetPayload<{ select: typeof listingCardSelect }>;
export type ListingDetail = Prisma.ListingGetPayload<{ select: typeof listingDetailSelect }>;

export interface PublicUser {
  id: string;
  email: string;
  role: Role;
  isEmailVerified: boolean;
  createdAt: Date;
  companyName: string | null;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResult extends TokenPair {
  user: PublicUser;
}

export interface Paginated<T> {
  items: T[];
  meta: PageMeta;
}
