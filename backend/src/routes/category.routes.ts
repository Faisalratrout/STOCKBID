import { Router } from 'express';
import * as ctrl from '../controllers/category.controller';

export const categoryRoutes = Router();

categoryRoutes.get('/', ctrl.list);
