import type { RequestHandler } from 'express';
import type { Role } from '@prisma/client';
import { ApiError } from '../utils/ApiError';

/** AUTH-07: role-based access control. Must run after `authenticate`. */
export const requireRole =
  (...roles: Role[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.user) return next(ApiError.unauthorized());
    if (!roles.includes(req.user.role)) return next(ApiError.forbidden());
    next();
  };
