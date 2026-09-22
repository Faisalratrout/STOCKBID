import { z } from 'zod';
import { page, pageSize } from './common.validators';

const STATUSES = ['PENDING', 'CONFIRMED', 'FULFILLED', 'COMPLETED', 'CANCELLED'] as const;

export const orderListQuerySchema = z.object({
  status: z.enum(STATUSES).optional(),
  page,
  pageSize,
});

// PENDING is the initial state only; it is never set by a client request.
export const updateOrderStatusSchema = z.object({
  status: z.enum(['CONFIRMED', 'FULFILLED', 'COMPLETED', 'CANCELLED']),
});

export type OrderListQuery = z.infer<typeof orderListQuerySchema>;
export type UpdateOrderStatusInput = z.infer<typeof updateOrderStatusSchema>;
