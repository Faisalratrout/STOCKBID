import type { ListingStatus, SellingMethod } from './listing';

export type OfferStatus = 'PENDING' | 'COUNTERED' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED';

// Mirrors backend/src/types/offer.select.ts:offerSelect
export interface OfferView {
  id: string;
  listingId: string;
  buyerId: string;
  quantity: number;
  price: string;
  message: string | null;
  status: OfferStatus;
  parentOfferId: string | null;
  createdBySellerCounter: boolean;
  createdAt: string;
  updatedAt: string;
  listing: {
    id: string;
    title: string;
    sellerId: string;
    status: ListingStatus;
    sellingMethod: SellingMethod;
    startingPrice: string;
    quantityAvailable: number;
    images: { url: string }[];
  };
  buyer: {
    id: string;
    businessProfile: { companyName: string; logoUrl: string | null } | null;
  };
  order: { id: string } | null;
}

// Mirrors backend/src/services/offer.service.ts:getOffer
export interface OfferDetail extends OfferView {
  history: OfferView[];
}
