import { Router } from 'express';
import * as ctrl from '../controllers/auction.controller';
import { authenticate } from '../middlewares/auth.middleware';
import { requireRole } from '../middlewares/role.middleware';
import { validate } from '../middlewares/validate.middleware';
import { biddingLimiter } from '../middlewares/rateLimiter.middleware';
import { idParamSchema } from '../validators/common.validators';
import { bidListQuerySchema, placeBidSchema } from '../validators/auction.validators';

export const auctionRoutes = Router();

auctionRoutes.use(authenticate);

const byId = validate({ params: idParamSchema });

auctionRoutes.get('/:id', byId, ctrl.detail);
auctionRoutes.get('/:id/bids', validate({ params: idParamSchema, query: bidListQuerySchema }), ctrl.bids);
// AUC-02/03: bidding is buyer-only. Roles are exclusive per user, so a listing's own seller
// (a SELLER-role account) can never pass this check and bid on their own auction.
auctionRoutes.post(
  '/:id/bids',
  requireRole('BUYER'),
  biddingLimiter,
  validate({ params: idParamSchema, body: placeBidSchema }),
  ctrl.bid,
);
