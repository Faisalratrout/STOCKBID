import { asyncHandler } from '../utils/asyncHandler';
import { created, ok } from '../utils/ApiResponse';
import { requireUser } from '../utils/requestUser';
import * as offerService from '../services/offer.service';

const offerId = (p: Record<string, unknown>) => String(p.id);

export const create = asyncHandler(async (req, res) => {
  created(res, await offerService.createOffer(requireUser(req).id, req.body));
});

export const made = asyncHandler(async (req, res) => {
  const { items, meta } = await offerService.listMadeOffers(requireUser(req).id, res.locals.query);
  ok(res, items, meta);
});

export const received = asyncHandler(async (req, res) => {
  const { items, meta } = await offerService.listReceivedOffers(
    requireUser(req).id,
    res.locals.query,
  );
  ok(res, items, meta);
});

export const detail = asyncHandler(async (req, res) => {
  ok(res, await offerService.getOffer(offerId(req.params), requireUser(req)));
});

export const accept = asyncHandler(async (req, res) => {
  ok(res, await offerService.acceptOffer(offerId(req.params), requireUser(req)));
});

export const reject = asyncHandler(async (req, res) => {
  ok(res, await offerService.rejectOffer(offerId(req.params), requireUser(req)));
});

export const withdraw = asyncHandler(async (req, res) => {
  ok(res, await offerService.withdrawOffer(offerId(req.params), requireUser(req)));
});

export const counter = asyncHandler(async (req, res) => {
  created(res, await offerService.counterOffer(offerId(req.params), requireUser(req), req.body));
});
