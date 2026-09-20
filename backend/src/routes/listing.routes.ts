import { Router } from 'express';
import * as ctrl from '../controllers/listing.controller';
import { authenticate, optionalAuth } from '../middlewares/auth.middleware';
import { requireRole } from '../middlewares/role.middleware';
import { imageUpload } from '../middlewares/upload.middleware';
import { validate } from '../middlewares/validate.middleware';
import {
  browseQuerySchema,
  createListingSchema,
  listingIdParamSchema,
  listingImageParamSchema,
  mineQuerySchema,
  updateListingSchema,
} from '../validators/listing.validators';

export const listingRoutes = Router();

const seller = [authenticate, requireRole('SELLER')];

// Public browse / search (BRW-01..03, BRW-05)
listingRoutes.get('/', validate({ query: browseQuerySchema }), ctrl.browse);

// Seller-only. Declared before '/:id' so "mine" is not parsed as an id.
listingRoutes.get('/mine', ...seller, validate({ query: mineQuerySchema }), ctrl.mine);
listingRoutes.post('/', ...seller, validate({ body: createListingSchema }), ctrl.create);

// Detail (BRW-04): public, but owners/admins can also see delisted listings.
listingRoutes.get('/:id', optionalAuth, validate({ params: listingIdParamSchema }), ctrl.detail);

listingRoutes.patch(
  '/:id',
  ...seller,
  validate({ params: listingIdParamSchema, body: updateListingSchema }),
  ctrl.update,
);
listingRoutes.delete('/:id', ...seller, validate({ params: listingIdParamSchema }), ctrl.delist);
listingRoutes.post(
  '/:id/images',
  ...seller,
  validate({ params: listingIdParamSchema }),
  imageUpload.single('image'),
  ctrl.addImage,
);
listingRoutes.delete(
  '/:id/images/:imageId',
  ...seller,
  validate({ params: listingImageParamSchema }),
  ctrl.removeImage,
);
