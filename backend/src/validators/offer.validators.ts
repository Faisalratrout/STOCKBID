import { z } from 'zod';
import { money, page, pageSize } from './common.validators';

const STATUSES = ['PENDING', 'COUNTERED', 'ACCEPTED', 'REJECTED', 'EXPIRED'] as const;

const terms = {
  quantity: z.number().int().min(1).max(1_000_000),
  price: money, // per unit
  message: z.string().trim().max(1000).optional(),
};

export const createOfferSchema = z.object({ listingId: z.uuid(), ...terms });
export const counterOfferSchema = z.object(terms);

export const offerListQuerySchema = z.object({
  status: z.enum(STATUSES).optional(),
  listingId: z.uuid().optional(),
  page,
  pageSize,
});

export type CreateOfferInput = z.infer<typeof createOfferSchema>;
export type CounterOfferInput = z.infer<typeof counterOfferSchema>;
export type OfferListQuery = z.infer<typeof offerListQuerySchema>;
