import { Router } from 'express';
import * as ctrl from '../controllers/notification.controller';
import { authenticate } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import { idParamSchema } from '../validators/common.validators';
import { notificationListQuerySchema } from '../validators/notification.validators';

export const notificationRoutes = Router();

notificationRoutes.use(authenticate);

// NOT-02
notificationRoutes.get('/', validate({ query: notificationListQuerySchema }), ctrl.list);
// NOT-03
notificationRoutes.patch('/read-all', ctrl.markAllRead);
notificationRoutes.patch('/:id/read', validate({ params: idParamSchema }), ctrl.markRead);
