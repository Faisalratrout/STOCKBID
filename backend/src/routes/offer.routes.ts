import { Router } from 'express';
import * as ctrl from '../controllers/offer.controller';
import { authenticate } from '../middlewares/auth.middleware';
import { requireRole } from '../middlewares/role.middleware';
import { validate } from '../middlewares/validate.middleware';
import { idParamSchema } from '../validators/common.validators';
import {
  counterOfferSchema,
  createOfferSchema,
  offerListQuerySchema,
} from '../validators/offer.validators';

export const offerRoutes = Router();

offerRoutes.use(authenticate);

offerRoutes.post('/', requireRole('BUYER'), validate({ body: createOfferSchema }), ctrl.create);
offerRoutes.get(
  '/mine',
  requireRole('BUYER'),
  validate({ query: offerListQuerySchema }),
  ctrl.made,
);
offerRoutes.get(
  '/received',
  requireRole('SELLER'),
  validate({ query: offerListQuerySchema }),
  ctrl.received,
);

// Responding is turn-based, not role-based: a buyer answers a seller's counter and vice versa.
// The service enforces whose turn it is.
const party = requireRole('BUYER', 'SELLER');
const byId = validate({ params: idParamSchema });

offerRoutes.get('/:id', byId, ctrl.detail);
offerRoutes.post('/:id/accept', party, byId, ctrl.accept);
offerRoutes.post('/:id/reject', party, byId, ctrl.reject);
offerRoutes.post('/:id/withdraw', party, byId, ctrl.withdraw);
offerRoutes.post(
  '/:id/counter',
  party,
  validate({ params: idParamSchema, body: counterOfferSchema }),
  ctrl.counter,
);
