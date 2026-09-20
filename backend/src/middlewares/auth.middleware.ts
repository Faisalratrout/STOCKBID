import type { RequestHandler } from 'express';
import { ApiError } from '../utils/ApiError';
import { verifyAccessToken } from '../utils/tokens';

const parseBearer = (header: string | undefined) => {
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : null;
};

/** AUTH-07: requires a valid access token and sets req.user. */
export const authenticate: RequestHandler = (req, _res, next) => {
  const token = parseBearer(req.headers.authorization);
  if (!token) return next(ApiError.unauthorized());
  try {
    const { sub, role } = verifyAccessToken(token);
    req.user = { id: sub, role };
    next();
  } catch {
    next(ApiError.unauthorized('Invalid or expired token'));
  }
};

/** Sets req.user when a valid token is present, but never rejects (public pages with owner extras). */
export const optionalAuth: RequestHandler = (req, _res, next) => {
  const token = parseBearer(req.headers.authorization);
  if (token) {
    try {
      const { sub, role } = verifyAccessToken(token);
      req.user = { id: sub, role };
    } catch {
      // Ignore: treated as anonymous.
    }
  }
  next();
};
