import { Router } from 'express';
import * as ctrl from '../controllers/auth.controller';
import { authenticate } from '../middlewares/auth.middleware';
import { authLimiter } from '../middlewares/rateLimiter.middleware';
import { validate } from '../middlewares/validate.middleware';
import {
  forgotPasswordSchema,
  loginSchema,
  refreshSchema,
  registerSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from '../validators/auth.validators';

export const authRoutes = Router();

authRoutes.post('/register', authLimiter, validate({ body: registerSchema }), ctrl.register);
authRoutes.post('/login', authLimiter, validate({ body: loginSchema }), ctrl.login);
authRoutes.post('/refresh', authLimiter, validate({ body: refreshSchema }), ctrl.refresh);
authRoutes.post('/logout', validate({ body: refreshSchema }), ctrl.logout);
authRoutes.post(
  '/verify-email',
  authLimiter,
  validate({ body: verifyEmailSchema }),
  ctrl.verifyEmail,
);
authRoutes.post('/resend-verification', authLimiter, authenticate, ctrl.resendVerification);
authRoutes.post(
  '/forgot-password',
  authLimiter,
  validate({ body: forgotPasswordSchema }),
  ctrl.forgotPassword,
);
authRoutes.post(
  '/reset-password',
  authLimiter,
  validate({ body: resetPasswordSchema }),
  ctrl.resetPassword,
);
authRoutes.get('/me', authenticate, ctrl.me);
