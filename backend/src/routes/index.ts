import { Router } from 'express';

export const router = Router();

router.get('/health', (_req, res) => {
  res.json({ success: true, data: { status: 'ok', uptime: process.uptime() } });
});

// Module routers are mounted here as they are built:
// router.use('/auth', authRoutes); ...
