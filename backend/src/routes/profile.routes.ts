import { Router } from 'express';
import * as ctrl from '../controllers/profile.controller';
import { authenticate } from '../middlewares/auth.middleware';
import { imageUpload } from '../middlewares/upload.middleware';
import { requireRole } from '../middlewares/role.middleware';
import { validate } from '../middlewares/validate.middleware';
import {
  setInterestsSchema,
  updateProfileSchema,
  userIdParamSchema,
} from '../validators/profile.validators';

export const profileRoutes = Router();

// Admins have no business profile.
const business = [authenticate, requireRole('BUYER', 'SELLER')];

profileRoutes.get('/me', ...business, ctrl.getMine);
profileRoutes.patch('/me', ...business, validate({ body: updateProfileSchema }), ctrl.updateMine);
profileRoutes.post('/me/logo', ...business, imageUpload.single('logo'), ctrl.uploadLogo);
profileRoutes.put(
  '/me/interests',
  ...business,
  validate({ body: setInterestsSchema }),
  ctrl.setInterests,
);
profileRoutes.get('/:userId', validate({ params: userIdParamSchema }), ctrl.getPublic);
