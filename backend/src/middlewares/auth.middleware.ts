import type { RequestHandler } from 'express';
import { ApiError } from '../utils/ApiError';
import { verifyAccessToken } from '../utils/tokens';

const parseBearer = (header: string | undefined) => {
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : null;
};

// AUTH-07
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

export const optionalAuth: RequestHandler = (req, _res, next) => {
  const token = parseBearer(req.headers.authorization);
  if (token) {
    try {
      const { sub, role } = verifyAccessToken(token);
      req.user = { id: sub, role };
    } catch {
      // Bad token on a public route: carry on as anonymous instead of rejecting.
    }
  }
  next();
};
