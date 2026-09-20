import { z } from 'zod';

// Matches Decimal(12,2): float math is why the cents check is tolerance-based.
export const money = z
  .number()
  .positive()
  .max(9_999_999_999.99)
  .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, 'At most 2 decimal places');

export const page = z.coerce.number().int().min(1).default(1);
export const pageSize = z.coerce.number().int().min(1).max(50).default(12);

export const idParamSchema = z.object({ id: z.uuid() });
