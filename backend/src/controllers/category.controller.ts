import { asyncHandler } from '../utils/asyncHandler';
import { ok } from '../utils/ApiResponse';
import * as categoryService from '../services/category.service';

export const list = asyncHandler(async (_req, res) => {
  ok(res, await categoryService.listCategories());
});
