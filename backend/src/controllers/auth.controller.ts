import { asyncHandler } from '../utils/asyncHandler';
import { created, noContent, ok } from '../utils/ApiResponse';
import { requireUser } from '../utils/requestUser';
import * as authService from '../services/auth.service';

export const register = asyncHandler(async (req, res) => {
  created(res, await authService.register(req.body));
});

export const login = asyncHandler(async (req, res) => {
  ok(res, await authService.login(req.body));
});

export const refresh = asyncHandler(async (req, res) => {
  ok(res, await authService.refresh(req.body.refreshToken));
});

export const logout = asyncHandler(async (req, res) => {
  await authService.logout(req.body.refreshToken);
  noContent(res);
});

export const verifyEmail = asyncHandler(async (req, res) => {
  await authService.verifyEmail(req.body.token);
  ok(res, { message: 'Email verified' });
});

export const resendVerification = asyncHandler(async (req, res) => {
  await authService.resendVerification(requireUser(req).id);
  ok(res, { message: 'Verification email sent' });
});

export const forgotPassword = asyncHandler(async (req, res) => {
  await authService.forgotPassword(req.body.email);
  ok(res, { message: 'If that email is registered, a reset link has been sent' });
});

export const resetPassword = asyncHandler(async (req, res) => {
  await authService.resetPassword(req.body.token, req.body.password);
  ok(res, { message: 'Password updated. Please log in again.' });
});

export const me = asyncHandler(async (req, res) => {
  ok(res, await authService.getMe(requireUser(req).id));
});
