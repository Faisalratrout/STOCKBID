import type { Request } from 'express';
import type { AuthUser } from '../types/express';
import { ApiError } from './ApiError';

/** Returns the authenticated user or throws 401 (use inside handlers behind `authenticate`). */
export const requireUser = (req: Request): AuthUser => {
  if (!req.user) throw ApiError.unauthorized();
  return req.user;
};
