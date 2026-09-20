import type { NotificationType, Prisma } from '@prisma/client';
import { prisma } from '../config/db';

interface NewNotification {
  userId: string;
  type: NotificationType;
  message: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
}

// Takes the caller's transaction client so a notification commits or rolls back with the
// state change that caused it. Read/list/mark-read endpoints arrive with NOT-01..05.
export const createNotification = (
  data: NewNotification,
  db: Prisma.TransactionClient | typeof prisma = prisma,
) => db.notification.create({ data });
