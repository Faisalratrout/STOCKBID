import type { Prisma } from '@prisma/client';

// ORD-01: orders are created automatically when an offer is accepted (auction wins follow
// in the Auction module). Always called inside the accepting transaction.
// agreedPrice is the per-unit price; the order total is quantity * agreedPrice.
export const createOrderFromOffer = (
  tx: Prisma.TransactionClient,
  offer: {
    id: string;
    listingId: string;
    buyerId: string;
    quantity: number;
    price: Prisma.Decimal;
  },
  listing: { sellerId: string; handoverMethod: 'PICKUP' | 'SELLER_DELIVERY' | 'BUYER_PICKUP' },
) =>
  tx.order.create({
    data: {
      listingId: offer.listingId,
      buyerId: offer.buyerId,
      sellerId: listing.sellerId,
      sourceType: 'OFFER',
      offerId: offer.id,
      quantity: offer.quantity,
      agreedPrice: offer.price,
      handoverMethod: listing.handoverMethod,
    },
  });
