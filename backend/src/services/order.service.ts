import type { OrderStatus, Prisma } from '@prisma/client';
import { prisma } from '../config/db';
import { ApiError } from '../utils/ApiError';
import { lockAuction, lockListing } from '../utils/locks';
import { pageMeta } from '../utils/ApiResponse';
import type { AuthUser } from '../types/express';
import type { OrderView, Paginated } from '../types/dto';
import { orderSelect } from '../types/order.select';
import type { OrderListQuery, UpdateOrderStatusInput } from '../validators/order.validators';
import { createNotification } from './notification.service';

// ORD-01: orders are created automatically when an offer is accepted. totalPrice is the
// authoritative amount (quantity * the offer's unit price, exact in Decimal); agreedPrice is the
// per-unit price for display.
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
      totalPrice: offer.price.mul(offer.quantity),
      handoverMethod: listing.handoverMethod,
    },
  });

// ORD-01/AUC-06: orders are created automatically when an auction closes with a winning bid.
// totalPrice is the winning bid amount itself. agreedPrice is winningBid.amount / quantity rounded
// to cents by the caller, display only: quantity * agreedPrice may not equal totalPrice.
export const createOrderFromAuction = (
  tx: Prisma.TransactionClient,
  data: {
    listingId: string;
    buyerId: string;
    sellerId: string;
    auctionId: string;
    quantity: number;
    agreedPrice: Prisma.Decimal;
    totalPrice: Prisma.Decimal;
    handoverMethod: 'PICKUP' | 'SELLER_DELIVERY' | 'BUYER_PICKUP';
  },
) =>
  tx.order.create({
    data: {
      listingId: data.listingId,
      buyerId: data.buyerId,
      sellerId: data.sellerId,
      sourceType: 'AUCTION',
      auctionId: data.auctionId,
      quantity: data.quantity,
      agreedPrice: data.agreedPrice,
      totalPrice: data.totalPrice,
      handoverMethod: data.handoverMethod,
    },
  });

const paginate = async (
  where: Prisma.OrderWhereInput,
  query: OrderListQuery,
): Promise<Paginated<OrderView>> => {
  const [total, items] = await prisma.$transaction([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      select: orderSelect,
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);
  return { items, meta: pageMeta(query.page, query.pageSize, total) };
};

/** ORD-02 */
export const listPurchases = (buyerId: string, query: OrderListQuery) =>
  paginate({ buyerId, ...(query.status ? { status: query.status } : {}) }, query);

/** ORD-02 */
export const listSales = (sellerId: string, query: OrderListQuery) =>
  paginate({ sellerId, ...(query.status ? { status: query.status } : {}) }, query);

/** ORD-02 */
export const getOrder = async (orderId: string, actor: AuthUser): Promise<OrderView> => {
  const order = await prisma.order.findUnique({ where: { id: orderId }, select: orderSelect });
  const allowed =
    order &&
    (actor.role === 'ADMIN' || actor.id === order.buyerId || actor.id === order.sellerId);
  if (!order || !allowed) throw ApiError.notFound('Order not found');
  return order;
};

// ORD-03/04: who may move an order from which state to which, keyed [from][to]. Either party
// may cancel until the order is FULFILLED; after that nobody can.
type Party = 'buyer' | 'seller' | 'either';
const TRANSITIONS: Partial<Record<OrderStatus, Partial<Record<OrderStatus, Party>>>> = {
  PENDING: { CONFIRMED: 'seller', CANCELLED: 'either' },
  CONFIRMED: { FULFILLED: 'seller', CANCELLED: 'either' },
  FULFILLED: { COMPLETED: 'buyer' },
};

const canAct = (order: { buyerId: string; sellerId: string }, actor: AuthUser, party: Party) => {
  if (actor.role === 'ADMIN') return true;
  if (party === 'either') return actor.id === order.buyerId || actor.id === order.sellerId;
  return party === 'buyer' ? actor.id === order.buyerId : actor.id === order.sellerId;
};

type Tx = Prisma.TransactionClient;
type CancellableOrder = { listingId: string; auctionId: string | null; quantity: number };

// ORD-04: a cancelled order hands its units back. A sold-out listing reopens as ACTIVE. For an
// auction order the auction becomes CANCELLED (terminal) so its bids and winner are never reused;
// selling the lot again needs a fresh auction, which is a separate seller action.
const restock = async (tx: Tx, order: CancellableOrder) => {
  await tx.listing.update({
    where: { id: order.listingId },
    data: { quantityAvailable: { increment: order.quantity } },
  });
  await tx.listing.updateMany({
    where: { id: order.listingId, status: 'SOLD' },
    data: { status: 'ACTIVE' },
  });
  if (order.auctionId) {
    await tx.auction.update({ where: { id: order.auctionId }, data: { status: 'CANCELLED' } });
  }
};

/**
 * ORD-03/04. The guard lives in the UPDATE's WHERE (`status: order.status`), so two concurrent
 * status changes on the same order can't both succeed: the second sees `count !== 1` and fails
 * closed with 409. A cancel also takes the auction lock (auction orders) and then the listing
 * lock, the same order as delist/close, so the restock cannot race a bid, close or offer accept.
 */
export const updateOrderStatus = async (
  orderId: string,
  actor: AuthUser,
  input: UpdateOrderStatusInput,
): Promise<OrderView> => {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      buyerId: true,
      sellerId: true,
      status: true,
      listingId: true,
      auctionId: true,
      quantity: true,
    },
  });
  const isParty = order && (actor.id === order.buyerId || actor.id === order.sellerId);
  if (!order || (!isParty && actor.role !== 'ADMIN')) throw ApiError.notFound('Order not found');

  const party = TRANSITIONS[order.status]?.[input.status];
  if (!party) {
    throw ApiError.conflict(`Cannot move an order from ${order.status} to ${input.status}`);
  }
  if (!canAct(order, actor, party)) {
    throw ApiError.forbidden(`Only the ${party} can do that`);
  }

  const cancelling = input.status === 'CANCELLED';
  await prisma.$transaction(async (tx) => {
    if (cancelling) {
      if (order.auctionId) await lockAuction(tx, order.auctionId);
      await lockListing(tx, order.listingId);
    }

    const { count } = await tx.order.updateMany({
      where: { id: orderId, status: order.status },
      data: {
        status: input.status,
        ...(input.status === 'FULFILLED' ? { fulfilledAt: new Date() } : {}),
        ...(input.status === 'COMPLETED' ? { completedAt: new Date() } : {}),
      },
    });
    if (count !== 1) throw ApiError.conflict('Order status changed concurrently, please retry');

    if (cancelling) await restock(tx, order);

    // An admin acting on the order is neither party, so both are told.
    const recipients =
      actor.id === order.buyerId
        ? [order.sellerId]
        : actor.id === order.sellerId
          ? [order.buyerId]
          : [order.buyerId, order.sellerId];
    for (const userId of recipients) {
      await createNotification(
        {
          userId,
          type: 'ORDER_STATUS_CHANGED',
          message: `Order status changed to ${input.status}`,
          relatedEntityType: 'ORDER',
          relatedEntityId: orderId,
        },
        tx,
      );
    }
  });

  return getOrder(orderId, actor);
};
