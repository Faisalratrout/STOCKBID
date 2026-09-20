import { Router } from 'express';
import { authRoutes } from './auth.routes';
import { categoryRoutes } from './category.routes';
import { listingRoutes } from './listing.routes';
import { profileRoutes } from './profile.routes';

export const router = Router();

router.get('/health', (_req, res) => {
  res.json({ success: true, data: { status: 'ok', uptime: process.uptime() } });
});

router.use('/auth', authRoutes);
router.use('/profile', profileRoutes);
router.use('/categories', categoryRoutes);
router.use('/listings', listingRoutes);
