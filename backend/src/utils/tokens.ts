import crypto from 'node:crypto';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { Role } from '@prisma/client';
import { env } from '../config/env';

export const randomToken = () => crypto.randomBytes(32).toString('base64url');

/** Plain SHA-256 is enough for high-entropy one-time tokens (email verify / reset). */
export const sha256 = (value: string) => crypto.createHash('sha256').update(value).digest('hex');

/** Refresh tokens are stored as an HMAC keyed with JWT_REFRESH_SECRET, so a DB leak alone is useless. */
export const hashRefreshToken = (token: string) =>
  crypto.createHmac('sha256', env.JWT_REFRESH_SECRET).update(token).digest('hex');

export interface AccessTokenPayload {
  sub: string;
  role: Role;
}

export const signAccessToken = (user: { id: string; role: Role }) =>
  jwt.sign({ role: user.role }, env.JWT_ACCESS_SECRET, {
    subject: user.id,
    algorithm: 'HS256',
    expiresIn: env.JWT_ACCESS_TTL as SignOptions['expiresIn'],
  });

/** Throws (jsonwebtoken error) on bad signature / expiry / malformed payload. */
export const verifyAccessToken = (token: string): AccessTokenPayload => {
  const payload = jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: ['HS256'] });
  if (
    typeof payload === 'string' ||
    typeof payload.sub !== 'string' ||
    !Object.values(Role).includes(payload.role as Role)
  ) {
    throw new Error('Malformed access token payload');
  }
  return { sub: payload.sub, role: payload.role as Role };
};
