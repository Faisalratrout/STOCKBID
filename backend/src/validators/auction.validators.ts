import { z } from 'zod';
import { money, page, pageSize } from './common.validators';

// AUC-02: a bid is the total price for the whole lot, not a per-unit price.
export const placeBidSchema = z.object({ amount: money });

export const bidListQuerySchema = z.object({ page, pageSize });

export type PlaceBidInput = z.infer<typeof placeBidSchema>;
export type BidListQuery = z.infer<typeof bidListQuerySchema>;
