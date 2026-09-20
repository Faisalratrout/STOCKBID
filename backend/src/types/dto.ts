import type { Prisma, Role } from '@prisma/client';
import type { PageMeta } from '../utils/ApiResponse';
import type { listingCardSelect, listingDetailSelect } from './listing.select';

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
