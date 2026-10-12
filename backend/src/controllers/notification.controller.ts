import { asyncHandler } from '../utils/asyncHandler';
import { noContent, ok } from '../utils/ApiResponse';
import { requireUser } from '../utils/requestUser';
import * as notificationService from '../services/notification.service';

export const list = asyncHandler(async (req, res) => {
  const { items, meta } = await notificationService.listNotifications(
    requireUser(req).id,
    res.locals.query,
  );
  ok(res, items, meta);
});

export const markRead = asyncHandler(async (req, res) => {
  await notificationService.markNotificationRead(String(req.params.id), requireUser(req).id);
  noContent(res);
});

export const markAllRead = asyncHandler(async (req, res) => {
  await notificationService.markAllNotificationsRead(requireUser(req).id);
  noContent(res);
});
