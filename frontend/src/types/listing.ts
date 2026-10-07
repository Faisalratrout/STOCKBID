export type Condition = 'NEW' | 'USED';
export type SellingMethod = 'OFFER' | 'AUCTION';
export type ListingStatus = 'ACTIVE' | 'SOLD' | 'EXPIRED' | 'DELISTED';
export type AuctionStatus = 'SCHEDULED' | 'ACTIVE' | 'ENDED' | 'CANCELLED';

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

export type HandoverMethod = 'PICKUP' | 'SELLER_DELIVERY' | 'BUYER_PICKUP';

// Mirrors backend/src/types/listing.select.ts:listingDetailSelect
export interface ListingDetail {
  id: string;
  sellerId: string;
  title: string;
  description: string;
  condition: Condition;
  quantityTotal: number;
  quantityAvailable: number;
  location: string;
  sellingMethod: SellingMethod;
  startingPrice: string;
  handoverMethod: HandoverMethod;
  status: ListingStatus;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  category: Category;
  images: { id: string; url: string; position: number }[];
  auction: {
    id: string;
    startingBid: string;
    minIncrement: string;
    currentBid: string | null;
    startAt: string;
    endAt: string;
    status: AuctionStatus;
  } | null;
  seller: {
    id: string;
    businessProfile: {
      companyName: string;
      logoUrl: string | null;
      location: string;
      isVerified: boolean;
    } | null;
  };
}

// Mirrors backend/src/types/auction.select.ts:auctionDetailSelect + the *PerUnit fields
// backend/src/services/auction.service.ts computes server-side (backend/src/types/dto.ts:AuctionView)
export interface AuctionView {
  id: string;
  listingId: string;
  startingBid: string;
  minIncrement: string;
  currentBid: string | null;
  startAt: string;
  endAt: string;
  status: AuctionStatus;
  winningBidId: string | null;
  createdAt: string;
  updatedAt: string;
  startingBidPerUnit: string;
  currentBidPerUnit: string | null;
  listing: {
    id: string;
    title: string;
    sellerId: string;
    status: ListingStatus;
    quantityTotal: number;
    images: { url: string }[];
  };
}

// Mirrors backend/src/types/dto.ts:BidView
export interface BidView {
  id: string;
  auctionId: string;
  amount: string;
  amountPerUnit: string;
  createdAt: string;
  isMine: boolean;
  bidder: { label: string; companyName?: string | null; logoUrl?: string | null };
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
