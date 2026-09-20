import { Prisma } from '@prisma/client';
import { prisma } from '../config/db';
import { ApiError } from '../utils/ApiError';
import { pageMeta } from '../utils/ApiResponse';
import type { AuthUser } from '../types/express';
import type { ListingCard, ListingDetail, Paginated } from '../types/dto';
import { listingCardSelect, listingDetailSelect } from '../types/listing.select';
import type {
  BrowseQuery,
  CreateListingInput,
  MineQuery,
  UpdateListingInput,
} from '../validators/listing.validators';
import { uploadImage } from './media.service';

// Requirement mapping: STK-01 create listing, STK-02 auction terms on create, STK-03 edit,
// STK-04 delist, STK-05 photos, STK-06 seller's own listings, STK-07 expiry rules;
// BRW-01 browse, BRW-02 search, BRW-03 filter, BRW-04 detail, BRW-05 sort + pagination.

const MAX_IMAGES = 8;

/** A listing is publicly browsable when active, in stock and not past its expiry. */
const publiclyBrowsable = (now: Date): Prisma.ListingWhereInput => ({
  status: 'ACTIVE',
  quantityAvailable: { gt: 0 },
  OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
});

/** STK-01 / STK-02 */
export const createListing = async (
  sellerId: string,
  input: CreateListingInput,
): Promise<ListingDetail> => {
  const category = await prisma.category.findUnique({ where: { id: input.categoryId } });
  if (!category) throw ApiError.badRequest('Category does not exist');

  const isAuction = input.sellingMethod === 'AUCTION' && input.auction;
  const expiresAt = isAuction ? input.auction!.endAt : input.expiresAt;

  return prisma.listing.create({
    data: {
      sellerId,
      title: input.title,
      description: input.description,
      categoryId: input.categoryId,
      condition: input.condition,
      quantityTotal: input.quantity,
      quantityAvailable: input.quantity,
      location: input.location,
      sellingMethod: input.sellingMethod,
      startingPrice: input.startingPrice,
      handoverMethod: input.handoverMethod,
      expiresAt,
      ...(isAuction
        ? {
            auction: {
              create: {
                startingBid: input.startingPrice,
                minIncrement: input.auction!.minIncrement,
                endAt: input.auction!.endAt,
              },
            },
          }
        : {}),
    },
    select: listingDetailSelect,
  });
};

/** BRW-01..03, BRW-05 */
export const browseListings = async (query: BrowseQuery): Promise<Paginated<ListingCard>> => {
  const now = new Date();
  const and: Prisma.ListingWhereInput[] = [publiclyBrowsable(now)];

  if (query.q) {
    and.push({
      OR: [
        { title: { contains: query.q, mode: 'insensitive' } },
        { description: { contains: query.q, mode: 'insensitive' } },
      ],
    });
  }
  if (query.categoryId) and.push({ categoryId: query.categoryId });
  if (query.category) and.push({ category: { slug: query.category } });
  if (query.condition) and.push({ condition: query.condition });
  if (query.location) and.push({ location: { contains: query.location, mode: 'insensitive' } });
  if (query.minPrice !== undefined) and.push({ startingPrice: { gte: query.minPrice } });
  if (query.maxPrice !== undefined) and.push({ startingPrice: { lte: query.maxPrice } });

  // "ending soon" only makes sense for auctions.
  const sellingMethod = query.sort === 'ending_soon' ? 'AUCTION' : query.sellingMethod;
  if (sellingMethod) and.push({ sellingMethod });

  const orderBy: Prisma.ListingOrderByWithRelationInput[] = {
    newest: [{ createdAt: 'desc' as const }],
    price_asc: [{ startingPrice: 'asc' as const }, { createdAt: 'desc' as const }],
    price_desc: [{ startingPrice: 'desc' as const }, { createdAt: 'desc' as const }],
    ending_soon: [{ auction: { endAt: 'asc' as const } }],
  }[query.sort];

  const where: Prisma.ListingWhereInput = { AND: and };
  const [total, items] = await prisma.$transaction([
    prisma.listing.count({ where }),
    prisma.listing.findMany({
      where,
      orderBy,
      select: listingCardSelect,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);
  return { items, meta: pageMeta(query.page, query.pageSize, total) };
};

/** STK-06 */
export const listMine = async (
  sellerId: string,
  query: MineQuery,
): Promise<Paginated<ListingCard>> => {
  const where: Prisma.ListingWhereInput = {
    sellerId,
    ...(query.status ? { status: query.status } : {}),
  };
  const [total, items] = await prisma.$transaction([
    prisma.listing.count({ where }),
    prisma.listing.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: listingCardSelect,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);
  return { items, meta: pageMeta(query.page, query.pageSize, total) };
};

/** BRW-04: delisted listings are visible only to their owner and admins. */
export const getListing = async (id: string, viewer?: AuthUser): Promise<ListingDetail> => {
  const listing = await prisma.listing.findUnique({ where: { id }, select: listingDetailSelect });
  if (!listing) throw ApiError.notFound('Listing not found');

  const privileged = viewer?.role === 'ADMIN' || viewer?.id === listing.sellerId;
  if (listing.status === 'DELISTED' && !privileged) throw ApiError.notFound('Listing not found');
  return listing;
};

const loadOwned = async (id: string, sellerId: string) => {
  const listing = await prisma.listing.findUnique({
    where: { id },
    select: { id: true, sellerId: true, status: true, sellingMethod: true },
  });
  if (!listing) throw ApiError.notFound('Listing not found');
  if (listing.sellerId !== sellerId) throw ApiError.forbidden('This is not your listing');
  return listing;
};

/**
 * STK-03. Text fields are editable while ACTIVE. Price and quantity are only editable on OFFER
 * listings that have no offers or orders yet: the "no activity" condition is part of the UPDATE's
 * WHERE clause, so an offer arriving concurrently cannot slip past the check.
 */
export const updateListing = async (
  id: string,
  sellerId: string,
  input: UpdateListingInput,
): Promise<ListingDetail> => {
  const listing = await loadOwned(id, sellerId);
  if (listing.status !== 'ACTIVE') throw ApiError.conflict('Only active listings can be edited');

  const { quantity, startingPrice, categoryId, expiresAt, ...rest } = input;
  const restricted = quantity !== undefined || startingPrice !== undefined;

  if (restricted && listing.sellingMethod === 'AUCTION') {
    throw ApiError.conflict('Price and quantity cannot be changed on auction listings');
  }
  if (expiresAt !== undefined && listing.sellingMethod === 'AUCTION') {
    throw ApiError.conflict('Auction end time cannot be changed');
  }
  if (categoryId) {
    const category = await prisma.category.findUnique({ where: { id: categoryId } });
    if (!category) throw ApiError.badRequest('Category does not exist');
  }

  const { count } = await prisma.listing.updateMany({
    where: {
      id,
      sellerId,
      status: 'ACTIVE',
      ...(restricted ? { offers: { none: {} }, orders: { none: {} } } : {}),
    },
    data: {
      ...rest,
      ...(categoryId ? { categoryId } : {}),
      ...(expiresAt !== undefined ? { expiresAt } : {}),
      ...(startingPrice !== undefined ? { startingPrice } : {}),
      ...(quantity !== undefined ? { quantityTotal: quantity, quantityAvailable: quantity } : {}),
    },
  });
  if (count !== 1) {
    throw ApiError.conflict(
      restricted
        ? 'Price and quantity cannot be changed once offers or orders exist'
        : 'Listing can no longer be edited',
    );
  }
  return getListing(id, { id: sellerId, role: 'SELLER' });
};

/** STK-04: soft delete. An auction that already has bids cannot be pulled (atomic guard in WHERE). */
export const delistListing = async (id: string, sellerId: string): Promise<void> => {
  await loadOwned(id, sellerId);
  const { count } = await prisma.listing.updateMany({
    where: {
      id,
      sellerId,
      status: 'ACTIVE',
      OR: [{ auction: { is: null } }, { auction: { is: { bids: { none: {} } } } }],
    },
    data: { status: 'DELISTED' },
  });
  if (count !== 1) {
    throw ApiError.conflict('Listing is not active or its auction already has bids');
  }
};

/** STK-05 */
export const addImage = async (
  id: string,
  sellerId: string,
  file: Express.Multer.File | undefined,
) => {
  if (!file) throw ApiError.badRequest('Attach an image in the "image" field');
  const listing = await loadOwned(id, sellerId);
  if (listing.status !== 'ACTIVE') throw ApiError.conflict('Only active listings can be edited');

  const count = await prisma.listingImage.count({ where: { listingId: id } });
  if (count >= MAX_IMAGES)
    throw ApiError.conflict(`A listing can have at most ${MAX_IMAGES} images`);

  const url = await uploadImage(file.buffer, 'listings');
  return prisma.listingImage.create({
    data: { listingId: id, url, position: count },
    select: { id: true, url: true, position: true },
  });
};

/** STK-05 */
export const removeImage = async (id: string, imageId: string, sellerId: string) => {
  await loadOwned(id, sellerId);
  const { count } = await prisma.listingImage.deleteMany({ where: { id: imageId, listingId: id } });
  if (count !== 1) throw ApiError.notFound('Image not found');
};
