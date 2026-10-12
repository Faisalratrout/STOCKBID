import type { NotificationType, Prisma } from '@prisma/client';
import { prisma } from '../config/db';
import { ApiError } from '../utils/ApiError';
import { pageMeta } from '../utils/ApiResponse';
import type { NotificationView, Paginated } from '../types/dto';
import { notificationSelect } from '../types/notification.select';
import type { NotificationListQuery } from '../validators/notification.validators';

interface NewNotification {
  userId: string;
  type: NotificationType;
  message: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
}

// Takes the caller's transaction client so a notification commits or rolls back with the
// state change that caused it.
export const createNotification = (
  data: NewNotification,
  db: Prisma.TransactionClient | typeof prisma = prisma,
) => db.notification.create({ data });

/** NOT-02 */
export const listNotifications = async (
  userId: string,
  query: NotificationListQuery,
): Promise<Paginated<NotificationView>> => {
  const where: Prisma.NotificationWhereInput = {
    userId,
    ...(query.unreadOnly ? { isRead: false } : {}),
  };
  const [total, items] = await prisma.$transaction([
    prisma.notification.count({ where }),
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: notificationSelect,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);
  return { items, meta: pageMeta(query.page, query.pageSize, total) };
};

/** NOT-03: scoped to the caller, so another user's notification reads as not found. */
export const markNotificationRead = async (id: string, userId: string): Promise<void> => {
  const { count } = await prisma.notification.updateMany({
    where: { id, userId },
    data: { isRead: true },
  });
  if (count === 0) throw ApiError.notFound('Notification not found');
};

/** NOT-03 */
export const markAllNotificationsRead = async (userId: string): Promise<void> => {
  await prisma.notification.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true },
  });
};
