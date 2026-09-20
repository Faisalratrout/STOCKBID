import { z } from 'zod';

const CONDITIONS = ['NEW', 'USED'] as const;
const METHODS = ['OFFER', 'AUCTION'] as const;
const HANDOVERS = ['PICKUP', 'SELLER_DELIVERY', 'BUYER_PICKUP'] as const;
const STATUSES = ['ACTIVE', 'SOLD', 'EXPIRED', 'DELISTED'] as const;

/** Positive amount with at most 2 decimals (matches Decimal(12,2)). */
export const money = z
  .number()
  .positive()
  .max(9_999_999_999.99)
  .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, 'At most 2 decimal places');

const futureDate = z.coerce.date().refine((d) => d.getTime() > Date.now(), 'Must be in the future');

const fields = {
  title: z.string().trim().min(3).max(150),
  description: z.string().trim().min(10).max(5000),
  categoryId: z.uuid(),
  condition: z.enum(CONDITIONS),
  location: z.string().trim().min(2).max(150),
  handoverMethod: z.enum(HANDOVERS),
};

// STK-01 / STK-02: OFFER listings negotiate; AUCTION listings carry auction terms.
export const createListingSchema = z
  .object({
    ...fields,
    quantity: z.number().int().min(1).max(1_000_000),
    sellingMethod: z.enum(METHODS),
    startingPrice: money,
    expiresAt: futureDate.optional(),
    auction: z.object({ minIncrement: money, endAt: futureDate }).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.sellingMethod === 'AUCTION' && !v.auction) {
      ctx.addIssue({ code: 'custom', path: ['auction'], message: 'Required for auction listings' });
    }
    if (v.sellingMethod === 'OFFER' && v.auction) {
      ctx.addIssue({
        code: 'custom',
        path: ['auction'],
        message: 'Only allowed for auction listings',
      });
    }
  });

// Price and quantity are only editable while a listing has no offers/bids/orders (enforced in service).
export const updateListingSchema = z
  .object({
    ...fields,
    quantity: z.number().int().min(1).max(1_000_000),
    startingPrice: money,
    expiresAt: futureDate.nullable(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Provide at least one field to update');

export const listingIdParamSchema = z.object({ id: z.uuid() });
export const listingImageParamSchema = z.object({ id: z.uuid(), imageId: z.uuid() });

const page = z.coerce.number().int().min(1).default(1);
const pageSize = z.coerce.number().int().min(1).max(50).default(12);

// BRW-01..05: search, filter, sort, paginate.
export const browseQuerySchema = z
  .object({
    q: z.string().trim().min(1).max(100).optional(),
    categoryId: z.uuid().optional(),
    category: z.string().trim().min(1).max(100).optional(), // slug
    condition: z.enum(CONDITIONS).optional(),
    sellingMethod: z.enum(METHODS).optional(),
    minPrice: z.coerce.number().nonnegative().optional(),
    maxPrice: z.coerce.number().nonnegative().optional(),
    location: z.string().trim().min(1).max(100).optional(),
    sort: z.enum(['newest', 'price_asc', 'price_desc', 'ending_soon']).default('newest'),
    page,
    pageSize,
  })
  .refine((v) => v.minPrice === undefined || v.maxPrice === undefined || v.minPrice <= v.maxPrice, {
    path: ['minPrice'],
    message: 'minPrice cannot exceed maxPrice',
  });

export const mineQuerySchema = z.object({
  status: z.enum(STATUSES).optional(),
  page,
  pageSize,
});

export type CreateListingInput = z.infer<typeof createListingSchema>;
export type UpdateListingInput = z.infer<typeof updateListingSchema>;
export type BrowseQuery = z.infer<typeof browseQuerySchema>;
export type MineQuery = z.infer<typeof mineQuerySchema>;
