import type { Listing, Offer, Prisma } from '@prisma/client';
import { prisma } from '../config/db';
import { ApiError } from '../utils/ApiError';
import { pageMeta } from '../utils/ApiResponse';
import type { AuthUser } from '../types/express';
import type { OfferView, Paginated } from '../types/dto';
import { offerSelect } from '../types/offer.select';
import type {
  CounterOfferInput,
  CreateOfferInput,
  OfferListQuery,
} from '../validators/offer.validators';
import { createNotification } from './notification.service';
import { createOrderFromOffer } from './order.service';

// Requirement mapping (OFR-xx): 01 make offer, 02 seller inbox / buyer offer list, 03 accept,
// 04 reject, 05 counter-offer, 06 buyer responds to a counter, 07 withdraw, 08 expiry.
// A pending offer is always waiting on exactly one party (its "turn"): the seller for a buyer's
// offer, the buyer for a seller's counter. Only that party can accept, reject or counter it.

export const OFFER_TTL_DAYS = 7;
const OFFER_TTL_MS = OFFER_TTL_DAYS * 24 * 60 * 60 * 1000;

type Tx = Prisma.TransactionClient;
type OfferWithListing = Offer & { listing: Listing };

// Every state change on a listing's offers/stock takes this row lock first. It serializes
// concurrent accepts, counters and new offers per listing, so stock checks below cannot be
// invalidated between the read and the write. Default READ COMMITTED is enough because each
// statement after the lock sees everything the previous lock holder committed.
const lockListing = async (tx: Tx, listingId: string) => {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM listings WHERE id = ${listingId} FOR UPDATE`;
  if (rows.length === 0) throw ApiError.notFound('Listing not found');
};

const isStale = (offer: Offer) => offer.createdAt.getTime() + OFFER_TTL_MS <= Date.now();

const listingOpenForDeals = (listing: Listing) =>
  listing.status === 'ACTIVE' && (!listing.expiresAt || listing.expiresAt > new Date());

const turnOwnerId = (offer: OfferWithListing) =>
  offer.createdBySellerCounter ? offer.buyerId : offer.listing.sellerId;

const creatorId = (offer: OfferWithListing) =>
  offer.createdBySellerCounter ? offer.listing.sellerId : offer.buyerId;

const otherParty = (offer: OfferWithListing, actorId: string) =>
  actorId === offer.buyerId ? offer.listing.sellerId : offer.buyerId;

const terms = (o: { quantity: number; price: { toString(): string } }, title: string) =>
  `${o.quantity} x ${title} at ${o.price.toString()} per unit`;

// Returns the offer under the listing lock. Parties only: outsiders get 404, not 403, so offer
// ids cannot be probed.
const loadPendingOffer = async (tx: Tx, offerId: string, actor: AuthUser) => {
  const pre = await tx.offer.findUnique({ where: { id: offerId }, select: { listingId: true } });
  if (!pre) throw ApiError.notFound('Offer not found');
  await lockListing(tx, pre.listingId);

  const offer = await tx.offer.findUnique({ where: { id: offerId }, include: { listing: true } });
  if (!offer || (actor.id !== offer.buyerId && actor.id !== offer.listing.sellerId)) {
    throw ApiError.notFound('Offer not found');
  }
  if (offer.status !== 'PENDING') throw ApiError.conflict(`Offer is already ${offer.status}`);
  // Not persisted here: throwing rolls the transaction back. expireStaleOffers does the write.
  if (isStale(offer)) throw ApiError.conflict('Offer has expired');
  return offer;
};

const requireTurn = (offer: OfferWithListing, actor: AuthUser) => {
  if (turnOwnerId(offer) !== actor.id) throw ApiError.forbidden('It is not your turn to respond');
};

const view = (id: string) => prisma.offer.findUniqueOrThrow({ where: { id }, select: offerSelect });

/** OFR-01 */
export const createOffer = async (buyerId: string, input: CreateOfferInput): Promise<OfferView> => {
  const id = await prisma.$transaction(async (tx) => {
    await lockListing(tx, input.listingId);
    const listing = await tx.listing.findUniqueOrThrow({ where: { id: input.listingId } });

    if (listing.sellingMethod !== 'OFFER') {
      throw ApiError.badRequest('This listing is sold by auction and does not accept offers');
    }
    if (!listingOpenForDeals(listing)) throw ApiError.conflict('Listing is no longer available');
    if (input.quantity > listing.quantityAvailable) {
      throw ApiError.badRequest(`Only ${listing.quantityAvailable} units are available`);
    }

    const open = await tx.offer.findFirst({
      where: { listingId: listing.id, buyerId, status: 'PENDING' },
      select: { id: true },
    });
    if (open) throw ApiError.conflict('You already have an open offer on this listing');

    const offer = await tx.offer.create({
      data: {
        listingId: listing.id,
        buyerId,
        quantity: input.quantity,
        price: input.price,
        message: input.message,
      },
    });
    await createNotification(
      {
        userId: listing.sellerId,
        type: 'NEW_OFFER',
        message: `New offer: ${terms(offer, listing.title)}`,
        relatedEntityType: 'OFFER',
        relatedEntityId: offer.id,
      },
      tx,
    );
    return offer.id;
  });
  return view(id);
};

/**
 * OFR-03 / OFR-06. Accepting decrements stock, marks the offer ACCEPTED and creates the order in
 * one transaction. The stock decrement is also guarded in its own WHERE (quantityAvailable >= n),
 * and the DB CHECK on listings.quantityAvailable backstops it, so overselling fails closed even
 * if the lock were ever bypassed.
 */
export const acceptOffer = async (offerId: string, actor: AuthUser) => {
  const orderId = await prisma.$transaction(async (tx) => {
    const offer = await loadPendingOffer(tx, offerId, actor);
    requireTurn(offer, actor);
    const { listing } = offer;
    if (!listingOpenForDeals(listing)) throw ApiError.conflict('Listing is no longer available');

    const { count } = await tx.listing.updateMany({
      where: { id: listing.id, quantityAvailable: { gte: offer.quantity } },
      data: { quantityAvailable: { decrement: offer.quantity } },
    });
    if (count !== 1) throw ApiError.conflict('Not enough stock left to accept this offer');

    await tx.offer.update({ where: { id: offer.id }, data: { status: 'ACCEPTED' } });
    const order = await createOrderFromOffer(tx, offer, listing);

    const { quantityAvailable } = await tx.listing.findUniqueOrThrow({
      where: { id: listing.id },
      select: { quantityAvailable: true },
    });
    if (quantityAvailable === 0) {
      await tx.listing.update({ where: { id: listing.id }, data: { status: 'SOLD' } });
      await tx.offer.updateMany({
        where: { listingId: listing.id, status: 'PENDING', id: { not: offer.id } },
        data: { status: 'EXPIRED' },
      });
    }

    await createNotification(
      {
        userId: otherParty(offer, actor.id),
        type: 'OFFER_ACCEPTED',
        message: `Offer accepted: ${terms(offer, listing.title)}`,
        relatedEntityType: 'ORDER',
        relatedEntityId: order.id,
      },
      tx,
    );
    return order.id;
  });
  return { offer: await view(offerId), orderId };
};

/** OFR-04 */
export const rejectOffer = async (offerId: string, actor: AuthUser): Promise<OfferView> => {
  await prisma.$transaction(async (tx) => {
    const offer = await loadPendingOffer(tx, offerId, actor);
    requireTurn(offer, actor);
    await tx.offer.update({ where: { id: offer.id }, data: { status: 'REJECTED' } });
    await createNotification(
      {
        userId: otherParty(offer, actor.id),
        type: 'OFFER_REJECTED',
        message: `Offer rejected: ${terms(offer, offer.listing.title)}`,
        relatedEntityType: 'OFFER',
        relatedEntityId: offer.id,
      },
      tx,
    );
  });
  return view(offerId);
};

/** OFR-07: the party who made the pending offer takes it back. OfferStatus has no WITHDRAWN, so it ends REJECTED. */
export const withdrawOffer = async (offerId: string, actor: AuthUser): Promise<OfferView> => {
  await prisma.$transaction(async (tx) => {
    const offer = await loadPendingOffer(tx, offerId, actor);
    if (creatorId(offer) !== actor.id) throw ApiError.forbidden('Only the sender can withdraw');
    await tx.offer.update({ where: { id: offer.id }, data: { status: 'REJECTED' } });
    await createNotification(
      {
        userId: otherParty(offer, actor.id),
        type: 'OFFER_REJECTED',
        message: `Offer withdrawn: ${terms(offer, offer.listing.title)}`,
        relatedEntityType: 'OFFER',
        relatedEntityId: offer.id,
      },
      tx,
    );
  });
  return view(offerId);
};

/** OFR-05 / OFR-06: closes the pending offer as COUNTERED and opens a new one for the other side. */
export const counterOffer = async (
  offerId: string,
  actor: AuthUser,
  input: CounterOfferInput,
): Promise<OfferView> => {
  const newId = await prisma.$transaction(async (tx) => {
    const offer = await loadPendingOffer(tx, offerId, actor);
    requireTurn(offer, actor);
    const { listing } = offer;
    if (!listingOpenForDeals(listing)) throw ApiError.conflict('Listing is no longer available');
    if (input.quantity > listing.quantityAvailable) {
      throw ApiError.badRequest(`Only ${listing.quantityAvailable} units are available`);
    }

    await tx.offer.update({ where: { id: offer.id }, data: { status: 'COUNTERED' } });
    const counter = await tx.offer.create({
      data: {
        listingId: listing.id,
        buyerId: offer.buyerId,
        quantity: input.quantity,
        price: input.price,
        message: input.message,
        parentOfferId: offer.id,
        createdBySellerCounter: actor.id === listing.sellerId,
      },
    });
    await createNotification(
      {
        userId: otherParty(offer, actor.id),
        type: 'COUNTER_OFFER',
        message: `Counter-offer: ${terms(counter, listing.title)}`,
        relatedEntityType: 'OFFER',
        relatedEntityId: counter.id,
      },
      tx,
    );
    return counter.id;
  });
  return view(newId);
};

/** OFR-08: called by the expiry job. Returns how many offers were expired. */
export const expireStaleOffers = async (now = new Date()): Promise<number> => {
  const { count } = await prisma.offer.updateMany({
    where: { status: 'PENDING', createdAt: { lte: new Date(now.getTime() - OFFER_TTL_MS) } },
    data: { status: 'EXPIRED' },
  });
  return count;
};

const paginate = async (
  where: Prisma.OfferWhereInput,
  query: OfferListQuery,
): Promise<Paginated<OfferView>> => {
  const [total, items] = await prisma.$transaction([
    prisma.offer.count({ where }),
    prisma.offer.findMany({
      where,
      select: offerSelect,
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);
  return { items, meta: pageMeta(query.page, query.pageSize, total) };
};

/** OFR-02: buyer's own offers and counters. */
export const listMadeOffers = (buyerId: string, query: OfferListQuery) =>
  paginate(
    {
      buyerId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.listingId ? { listingId: query.listingId } : {}),
    },
    query,
  );

/** OFR-02: seller's inbox across all their listings. */
export const listReceivedOffers = (sellerId: string, query: OfferListQuery) =>
  paginate(
    {
      listing: { sellerId },
      ...(query.status ? { status: query.status } : {}),
      ...(query.listingId ? { listingId: query.listingId } : {}),
    },
    query,
  );

const MAX_HISTORY = 50;

/** OFR-02: one offer plus the negotiation that led to it (oldest first). */
export const getOffer = async (offerId: string, actor: AuthUser) => {
  const offer = await prisma.offer.findUnique({ where: { id: offerId }, select: offerSelect });
  const allowed =
    offer &&
    (actor.role === 'ADMIN' || actor.id === offer.buyerId || actor.id === offer.listing.sellerId);
  if (!offer || !allowed) throw ApiError.notFound('Offer not found');

  const history: OfferView[] = [];
  let parentId = offer.parentOfferId;
  while (parentId && history.length < MAX_HISTORY) {
    const parent: OfferView | null = await prisma.offer.findUnique({
      where: { id: parentId },
      select: offerSelect,
    });
    if (!parent) break;
    history.unshift(parent);
    parentId = parent.parentOfferId;
  }
  return { ...offer, history };
};
