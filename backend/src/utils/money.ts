import { Prisma } from '@prisma/client';

/** Rounds a total-lot amount down to a per-unit Decimal(12,2), for display only. */
export const perUnit = (total: Prisma.Decimal, quantity: number): Prisma.Decimal =>
  new Prisma.Decimal(total).dividedBy(quantity).toDecimalPlaces(2);
