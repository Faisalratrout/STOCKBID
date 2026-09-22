import type { OrderStatus, Prisma } from '@prisma/client';
import { prisma } from '../config/db';
import { ApiError } from '../utils/ApiError';
import { pageMeta } from '../utils/ApiResponse';
import type { AuthUser } from '../types/express';
import type { OrderView, Paginated } from '../types/dto';
import { orderSelect } from '../types/order.select';
import type { OrderListQuery, UpdateOrderStatusInput } from '../validators/order.validators';
import { createNotification } from './notification.service';

// ORD-01: orders are created automatically when an offer is accepted.
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

// ORD-01/AUC-06: orders are created automatically when an auction closes with a winning bid.
// agreedPrice here is winningBid.amount / quantity, already rounded to cents by the caller.
export const createOrderFromAuction = (
  tx: Prisma.TransactionClient,
  data: {
    listingId: string;
    buyerId: string;
    sellerId: string;
    auctionId: string;
    quantity: number;
    agreedPrice: Prisma.Decimal;
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

// ORD-03/04: who may move an order from which state to which, keyed [from][to].
type Party = 'buyer' | 'seller';
const TRANSITIONS: Partial<Record<OrderStatus, Partial<Record<OrderStatus, Party>>>> = {
  PENDING: { CONFIRMED: 'seller', CANCELLED: 'seller' },
  CONFIRMED: { FULFILLED: 'seller', CANCELLED: 'buyer' },
  FULFILLED: { COMPLETED: 'buyer' },
};

const canAct = (order: { buyerId: string; sellerId: string }, actor: AuthUser, party: Party) =>
  actor.role === 'ADMIN' || (party === 'buyer' ? actor.id === order.buyerId : actor.id === order.sellerId);

/**
 * ORD-03/04. The order's row is not explicitly locked: the guard lives in the UPDATE's WHERE
 * (`status: order.status`), so two concurrent status changes on the same order can't both
 * succeed — the second sees `count !== 1` and fails closed with 409, same pattern as
 * `listing.service.updateListing`.
 */
export const updateOrderStatus = async (
  orderId: string,
  actor: AuthUser,
  input: UpdateOrderStatusInput,
): Promise<OrderView> => {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, buyerId: true, sellerId: true, status: true },
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

  const { count } = await prisma.order.updateMany({
    where: { id: orderId, status: order.status },
    data: {
      status: input.status,
      ...(input.status === 'FULFILLED' ? { fulfilledAt: new Date() } : {}),
      ...(input.status === 'COMPLETED' ? { completedAt: new Date() } : {}),
    },
  });
  if (count !== 1) throw ApiError.conflict('Order status changed concurrently, please retry');

  const other = actor.id === order.buyerId ? order.sellerId : order.buyerId;
  await createNotification({
    userId: other,
    type: 'ORDER_STATUS_CHANGED',
    message: `Order status changed to ${input.status}`,
    relatedEntityType: 'ORDER',
    relatedEntityId: orderId,
  });

  return getOrder(orderId, actor);
};
