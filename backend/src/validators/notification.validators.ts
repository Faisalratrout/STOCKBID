import { z } from 'zod';
import { page, pageSize } from './common.validators';

export const notificationListQuerySchema = z.object({
  // Not z.coerce.boolean(): that turns the string "false" into true.
  unreadOnly: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  page,
  pageSize,
});

export type NotificationListQuery = z.infer<typeof notificationListQuerySchema>;
