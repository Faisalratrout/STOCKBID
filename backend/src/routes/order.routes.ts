import { Router } from 'express';
import * as ctrl from '../controllers/order.controller';
import { authenticate } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import { idParamSchema } from '../validators/common.validators';
import { orderListQuerySchema, updateOrderStatusSchema } from '../validators/order.validators';

export const orderRoutes = Router();

orderRoutes.use(authenticate);

const byId = validate({ params: idParamSchema });
const byQuery = validate({ query: orderListQuerySchema });

orderRoutes.get('/purchases', byQuery, ctrl.purchases);
orderRoutes.get('/sales', byQuery, ctrl.sales);
orderRoutes.get('/:id', byId, ctrl.detail);
orderRoutes.patch(
  '/:id/status',
  validate({ params: idParamSchema, body: updateOrderStatusSchema }),
  ctrl.updateStatus,
);
