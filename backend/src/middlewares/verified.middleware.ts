import type { RequestHandler } from 'express';
import { prisma } from '../config/db';
import { ApiError } from '../utils/ApiError';

/**
 * AUTH-04: creating listings, making offers and bidding need a verified email. Read from the DB
 * rather than a token claim, so verifying takes effect immediately without a re-login.
 * Must run after `authenticate`.
 */
export const requireVerifiedEmail: RequestHandler = async (req, _res, next) => {
  if (!req.user) return next(ApiError.unauthorized());
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { isEmailVerified: true },
    });
    if (!user) return next(ApiError.unauthorized());
    if (!user.isEmailVerified) return next(ApiError.emailNotVerified());
    next();
  } catch (err) {
    next(err);
  }
};
