import bcrypt from 'bcrypt';
import { Prisma, type Role, type User } from '@prisma/client';
import { prisma } from '../config/db';
import { env } from '../config/env';
import { ApiError } from '../utils/ApiError';
import { hashRefreshToken, randomToken, sha256, signAccessToken } from '../utils/tokens';
import { appLink, sendMail } from './mailer.service';
import type { AuthResult, PublicUser, TokenPair } from '../types/dto';
import type { LoginInput, RegisterInput } from '../validators/auth.validators';

// Requirement mapping (AUTH-xx): 01 register, 02 login, 03 refresh/logout,
// 04 email verification, 05 password reset request, 06 password reset,
// 07 role-based access (see middlewares/auth + role).

const BCRYPT_ROUNDS = 12;
const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 60 * 60 * 1000;

let dummyHash: Promise<string> | undefined;
/** Compared against when the email is unknown so login timing does not reveal account existence. */
const getDummyHash = () => (dummyHash ??= bcrypt.hash('not-a-real-password', BCRYPT_ROUNDS));

const invalidCredentials = () => ApiError.unauthorized('Invalid email or password');

type UserWithProfile = User & { businessProfile: { companyName: string } | null };

const toPublicUser = (u: UserWithProfile): PublicUser => ({
  id: u.id,
  email: u.email,
  role: u.role,
  isEmailVerified: u.isEmailVerified,
  createdAt: u.createdAt,
  companyName: u.businessProfile?.companyName ?? null,
});

const issueTokens = async (
  user: { id: string; role: Role },
  db: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<TokenPair> => {
  const refreshToken = randomToken();
  await db.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: hashRefreshToken(refreshToken),
      expiresAt: new Date(Date.now() + env.JWT_REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000),
    },
  });
  return { accessToken: signAccessToken(user), refreshToken };
};

const createVerificationToken = async (userId: string, email: string) => {
  const token = randomToken();
  await prisma.emailVerificationToken.create({
    data: { userId, tokenHash: sha256(token), expiresAt: new Date(Date.now() + VERIFY_TTL_MS) },
  });
  await sendMail({
    to: email,
    subject: 'Verify your STOCKBID email',
    text: `Verify your email: ${appLink('/verify-email', { token })}`,
  });
};

/** AUTH-01 */
export const register = async (input: RegisterInput): Promise<AuthResult> => {
  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

  let user: UserWithProfile;
  try {
    user = await prisma.user.create({
      data: {
        email: input.email,
        passwordHash,
        role: input.role,
        businessProfile: { create: { companyName: input.companyName } },
      },
      include: { businessProfile: { select: { companyName: true } } },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      throw ApiError.conflict('An account with this email already exists');
    }
    throw e;
  }

  await createVerificationToken(user.id, user.email);
  const tokens = await issueTokens(user);
  return { user: toPublicUser(user), ...tokens };
};

/** AUTH-02 */
export const login = async (input: LoginInput): Promise<AuthResult> => {
  const user = await prisma.user.findUnique({
    where: { email: input.email },
    include: { businessProfile: { select: { companyName: true } } },
  });

  const valid = await bcrypt.compare(input.password, user?.passwordHash ?? (await getDummyHash()));
  if (!user || !valid) throw invalidCredentials();
  if (!user.isActive) throw ApiError.forbidden('This account has been deactivated');

  const tokens = await issueTokens(user);
  return { user: toPublicUser(user), ...tokens };
};

/**
 * AUTH-03: refresh with rotation. The old token is revoked atomically (updateMany guarded on
 * revokedAt IS NULL), so two concurrent refreshes with the same token can never both succeed.
 * Presenting an already-revoked token signals theft/replay: every session of that user is revoked.
 */
export const refresh = async (refreshToken: string): Promise<TokenPair> => {
  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashRefreshToken(refreshToken) },
    include: { user: true },
  });
  if (!stored) throw ApiError.unauthorized('Invalid refresh token');

  if (stored.revokedAt) {
    await prisma.refreshToken.updateMany({
      where: { userId: stored.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    throw ApiError.unauthorized('Invalid refresh token');
  }
  if (stored.expiresAt <= new Date()) throw ApiError.unauthorized('Refresh token expired');
  if (!stored.user.isActive) throw ApiError.forbidden('This account has been deactivated');

  return prisma.$transaction(async (tx) => {
    const { count } = await tx.refreshToken.updateMany({
      where: { id: stored.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (count !== 1) throw ApiError.unauthorized('Invalid refresh token');
    return issueTokens(stored.user, tx);
  });
};

/** AUTH-03: idempotent; unknown tokens are ignored. */
export const logout = async (refreshToken: string): Promise<void> => {
  await prisma.refreshToken.updateMany({
    where: { tokenHash: hashRefreshToken(refreshToken), revokedAt: null },
    data: { revokedAt: new Date() },
  });
};

/** AUTH-04 */
export const verifyEmail = async (token: string): Promise<void> => {
  const record = await prisma.emailVerificationToken.findUnique({
    where: { tokenHash: sha256(token) },
  });
  if (!record || record.usedAt || record.expiresAt <= new Date()) {
    throw ApiError.badRequest('Verification link is invalid or has expired');
  }
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.emailVerificationToken.updateMany({
      where: { id: record.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (count !== 1) throw ApiError.badRequest('Verification link is invalid or has expired');
    await tx.user.update({ where: { id: record.userId }, data: { isEmailVerified: true } });
  });
};

/** AUTH-04: authenticated resend. */
export const resendVerification = async (userId: string): Promise<void> => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw ApiError.unauthorized();
  if (user.isEmailVerified) throw ApiError.conflict('Email is already verified');
  await createVerificationToken(user.id, user.email);
};

/** AUTH-05: always succeeds so the response never reveals whether an email is registered. */
export const forgotPassword = async (email: string): Promise<void> => {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.isActive) return;

  const token = randomToken();
  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash: sha256(token),
      expiresAt: new Date(Date.now() + RESET_TTL_MS),
    },
  });
  await sendMail({
    to: user.email,
    subject: 'Reset your STOCKBID password',
    text: `Reset your password (valid 1 hour): ${appLink('/reset-password', { token })}`,
  });
};

/** AUTH-06: single-use token; all existing sessions are revoked. */
export const resetPassword = async (token: string, newPassword: string): Promise<void> => {
  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: sha256(token) },
  });
  if (!record || record.usedAt || record.expiresAt <= new Date()) {
    throw ApiError.badRequest('Reset link is invalid or has expired');
  }
  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

  await prisma.$transaction(async (tx) => {
    const { count } = await tx.passwordResetToken.updateMany({
      where: { id: record.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (count !== 1) throw ApiError.badRequest('Reset link is invalid or has expired');
    await tx.user.update({ where: { id: record.userId }, data: { passwordHash } });
    await tx.refreshToken.updateMany({
      where: { userId: record.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  });
};

export const getMe = async (userId: string): Promise<PublicUser> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { businessProfile: { select: { companyName: true } } },
  });
  if (!user || !user.isActive) throw ApiError.unauthorized();
  return toPublicUser(user);
};
