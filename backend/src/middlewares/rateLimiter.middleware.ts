import { rateLimit } from 'express-rate-limit';
import type { Request } from 'express';
import { env } from '../config/env';

const body = (message: string) => ({
  success: false,
  error: { code: 'TOO_MANY_REQUESTS', message },
});

const off = env.NODE_ENV === 'test';

/** Global safety net. */
export const apiLimiter = rateLimit({
  windowMs: 60_000,
  limit: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => off,
  message: body('Too many requests, slow down'),
});

/** Login / register / reset endpoints: brute-force protection (AUTH-01..07). */
export const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => off,
  message: body('Too many attempts, try again later'),
});

/** Bid placement (AUC-03): keyed per user when authenticated, per IP otherwise. */
export const biddingLimiter = rateLimit({
  windowMs: 10_000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => off,
  keyGenerator: (req: Request) => req.user?.id ?? req.ip ?? 'anonymous',
  validate: { keyGeneratorIpFallback: false },
  message: body('Bidding too fast, please wait a moment'),
});
