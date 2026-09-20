import { z } from 'zod';

const email = z.string().trim().toLowerCase().pipe(z.email().max(254));

// bcrypt silently truncates at 72 bytes, so cap there.
const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password must be at most 72 characters')
  .regex(/[A-Za-z]/, 'Password must contain a letter')
  .regex(/\d/, 'Password must contain a number');

const token = z.string().min(20).max(200);

// Admins are created by seed only; public registration is BUYER or SELLER.
export const registerSchema = z.object({
  email,
  password,
  role: z.enum(['BUYER', 'SELLER']),
  companyName: z.string().trim().min(2).max(120),
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1).max(72),
});

export const refreshSchema = z.object({ refreshToken: token });
export const verifyEmailSchema = z.object({ token });
export const forgotPasswordSchema = z.object({ email });
export const resetPasswordSchema = z.object({ token, password });

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
