import { asyncHandler } from '../utils/asyncHandler';
import { ok } from '../utils/ApiResponse';
import { requireUser } from '../utils/requestUser';
import * as orderService from '../services/order.service';

const orderId = (p: Record<string, unknown>) => String(p.id);

export const purchases = asyncHandler(async (req, res) => {
  const { items, meta } = await orderService.listPurchases(requireUser(req).id, res.locals.query);
  ok(res, items, meta);
});

export const sales = asyncHandler(async (req, res) => {
  const { items, meta } = await orderService.listSales(requireUser(req).id, res.locals.query);
  ok(res, items, meta);
});

export const detail = asyncHandler(async (req, res) => {
  ok(res, await orderService.getOrder(orderId(req.params), requireUser(req)));
});

export const updateStatus = asyncHandler(async (req, res) => {
  ok(res, await orderService.updateOrderStatus(orderId(req.params), requireUser(req), req.body));
});
