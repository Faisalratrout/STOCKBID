import { asyncHandler } from '../utils/asyncHandler';
import { ok } from '../utils/ApiResponse';
import { requireUser } from '../utils/requestUser';
import * as auctionService from '../services/auction.service';

const auctionId = (p: Record<string, unknown>) => String(p.id);

export const detail = asyncHandler(async (req, res) => {
  ok(res, await auctionService.getAuction(auctionId(req.params)));
});

export const bids = asyncHandler(async (req, res) => {
  const { items, meta } = await auctionService.listBids(auctionId(req.params), res.locals.query);
  ok(res, items, meta);
});

export const bid = asyncHandler(async (req, res) => {
  ok(res, await auctionService.placeBid(auctionId(req.params), requireUser(req), req.body));
});
