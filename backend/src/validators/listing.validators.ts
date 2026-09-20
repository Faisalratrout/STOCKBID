import { z } from 'zod';
import { idParamSchema, money, page, pageSize } from './common.validators';

const CONDITIONS = ['NEW', 'USED'] as const;
const METHODS = ['OFFER', 'AUCTION'] as const;
const HANDOVERS = ['PICKUP', 'SELLER_DELIVERY', 'BUYER_PICKUP'] as const;
const STATUSES = ['ACTIVE', 'SOLD', 'EXPIRED', 'DELISTED'] as const;

const futureDate = z.coerce.date().refine((d) => d.getTime() > Date.now(), 'Must be in the future');

const fields = {
  title: z.string().trim().min(3).max(150),
  description: z.string().trim().min(10).max(5000),
  categoryId: z.uuid(),
  condition: z.enum(CONDITIONS),
  location: z.string().trim().min(2).max(150),
  handoverMethod: z.enum(HANDOVERS),
};

// STK-01 / STK-02
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

export const updateListingSchema = z
  .object({
    ...fields,
    quantity: z.number().int().min(1).max(1_000_000),
    startingPrice: money,
    expiresAt: futureDate.nullable(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Provide at least one field to update');

export const listingIdParamSchema = idParamSchema;
export const listingImageParamSchema = z.object({ id: z.uuid(), imageId: z.uuid() });

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
