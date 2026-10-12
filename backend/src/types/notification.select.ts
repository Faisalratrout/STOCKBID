import type { Prisma } from '@prisma/client';

export const notificationSelect = {
  id: true,
  type: true,
  message: true,
  relatedEntityType: true,
  relatedEntityId: true,
  isRead: true,
  createdAt: true,
} satisfies Prisma.NotificationSelect;
