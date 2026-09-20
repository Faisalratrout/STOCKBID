import { describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import { authenticate } from '../src/middlewares/auth.middleware';
import { requireRole } from '../src/middlewares/role.middleware';
import { registerSchema, resetPasswordSchema } from '../src/validators/auth.validators';
import { hashRefreshToken, sha256, signAccessToken, verifyAccessToken } from '../src/utils/tokens';
import { ApiError } from '../src/utils/ApiError';

const run = (
  mw: (req: Request, res: Response, next: NextFunction) => void,
  req: Partial<Request>,
) => {
  const next = vi.fn();
  mw(req as Request, {} as Response, next);
  return next.mock.calls[0]?.[0] as ApiError | undefined;
};

describe('access tokens (AUTH-07)', () => {
  it('round-trips id and role', () => {
    const token = signAccessToken({ id: 'u1', role: 'SELLER' });
    expect(verifyAccessToken(token)).toEqual({ sub: 'u1', role: 'SELLER' });
  });

  it('rejects a tampered token', () => {
    const token = signAccessToken({ id: 'u1', role: 'BUYER' });
    expect(() => verifyAccessToken(token.slice(0, -2) + 'xx')).toThrow();
  });

  it('hashes refresh tokens deterministically and differently from plain sha256', () => {
    expect(hashRefreshToken('abc')).toBe(hashRefreshToken('abc'));
    expect(hashRefreshToken('abc')).not.toBe(sha256('abc'));
  });
});

describe('authenticate middleware', () => {
  it('rejects a missing token with 401', () => {
    expect(run(authenticate, { headers: {} })?.statusCode).toBe(401);
  });

  it('rejects a garbage token with 401', () => {
    expect(run(authenticate, { headers: { authorization: 'Bearer nope' } })?.statusCode).toBe(401);
  });

  it('sets req.user for a valid token', () => {
    const token = signAccessToken({ id: 'u1', role: 'BUYER' });
    const req = { headers: { authorization: `Bearer ${token}` } } as Partial<Request>;
    expect(run(authenticate, req)).toBeUndefined();
    expect(req.user).toEqual({ id: 'u1', role: 'BUYER' });
  });
});

describe('requireRole middleware (AUTH-07)', () => {
  it('forbids a role that is not allowed', () => {
    const err = run(requireRole('SELLER'), { user: { id: 'u1', role: 'BUYER' } });
    expect(err?.statusCode).toBe(403);
  });

  it('allows a permitted role', () => {
    expect(
      run(requireRole('SELLER', 'ADMIN'), { user: { id: 'u1', role: 'ADMIN' } }),
    ).toBeUndefined();
  });
});

describe('auth validators', () => {
  const valid = {
    email: ' Foo@Bar.COM ',
    password: 'abcdefg1',
    role: 'BUYER',
    companyName: 'Acme',
  };

  it('normalizes email', () => {
    expect(registerSchema.parse(valid).email).toBe('foo@bar.com');
  });

  it('refuses to self-register as ADMIN', () => {
    expect(registerSchema.safeParse({ ...valid, role: 'ADMIN' }).success).toBe(false);
  });

  it('enforces password rules', () => {
    expect(registerSchema.safeParse({ ...valid, password: 'short1' }).success).toBe(false);
    expect(registerSchema.safeParse({ ...valid, password: 'onlyletters' }).success).toBe(false);
    expect(registerSchema.safeParse({ ...valid, password: 'a1'.repeat(40) }).success).toBe(false);
    expect(
      resetPasswordSchema.safeParse({ token: 'x'.repeat(30), password: 'abcdefg1' }).success,
    ).toBe(true);
  });
});
