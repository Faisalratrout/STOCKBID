export type Condition = 'NEW' | 'USED';
export type SellingMethod = 'OFFER' | 'AUCTION';
export type ListingStatus = 'ACTIVE' | 'SOLD' | 'EXPIRED' | 'DELISTED';
export type AuctionStatus = 'SCHEDULED' | 'LIVE' | 'ENDED' | 'CANCELLED';

export interface Category {
  id: string;
  name: string;
  slug: string;
}

// Mirrors backend/src/types/listing.select.ts:listingCardSelect
export interface ListingCard {
  id: string;
  title: string;
  condition: Condition;
  quantityAvailable: number;
  location: string;
  sellingMethod: SellingMethod;
  startingPrice: string;
  status: ListingStatus;
  expiresAt: string | null;
  createdAt: string;
  category: Category;
  images: { url: string }[];
  auction: { currentBid: string | null; endAt: string; status: AuctionStatus } | null;
}

export type BrowseSort = 'newest' | 'price_asc' | 'price_desc' | 'ending_soon';

export interface BrowseFilters {
  q: string;
  categoryId: string;
  condition: Condition | '';
  sellingMethod: SellingMethod | '';
  location: string;
  minPrice: string;
  maxPrice: string;
  sort: BrowseSort;
  page: number;
}
