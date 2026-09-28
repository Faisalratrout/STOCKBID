import { Prisma } from '@prisma/client';

/** Per-unit share of a total-lot amount, rounded half-up to cents. Display only: never multiply back to get a total. */
export const perUnit = (total: Prisma.Decimal, quantity: number): Prisma.Decimal =>
  new Prisma.Decimal(total).dividedBy(quantity).toDecimalPlaces(2);
