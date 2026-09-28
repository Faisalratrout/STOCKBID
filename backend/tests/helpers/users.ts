import { prisma } from '../../src/config/db';

/** Mail is stubbed, so tests verify directly instead of clicking the emailed link (AUTH-04). */
export const markEmailVerified = (userId: string) =>
  prisma.user.update({ where: { id: userId }, data: { isEmailVerified: true } });
