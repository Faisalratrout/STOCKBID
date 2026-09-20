import { asyncHandler } from '../utils/asyncHandler';
import { created, noContent, ok } from '../utils/ApiResponse';
import { requireUser } from '../utils/requestUser';
import * as listingService from '../services/listing.service';

export const create = asyncHandler(async (req, res) => {
  created(res, await listingService.createListing(requireUser(req).id, req.body));
});

export const browse = asyncHandler(async (_req, res) => {
  const { items, meta } = await listingService.browseListings(res.locals.query);
  ok(res, items, meta);
});

export const mine = asyncHandler(async (req, res) => {
  const { items, meta } = await listingService.listMine(requireUser(req).id, res.locals.query);
  ok(res, items, meta);
});

export const detail = asyncHandler(async (req, res) => {
  ok(res, await listingService.getListing(String(req.params.id), req.user));
});

export const update = asyncHandler(async (req, res) => {
  ok(res, await listingService.updateListing(String(req.params.id), requireUser(req).id, req.body));
});

export const delist = asyncHandler(async (req, res) => {
  await listingService.delistListing(String(req.params.id), requireUser(req).id);
  noContent(res);
});

export const addImage = asyncHandler(async (req, res) => {
  created(res, await listingService.addImage(String(req.params.id), requireUser(req).id, req.file));
});

export const removeImage = asyncHandler(async (req, res) => {
  await listingService.removeImage(
    String(req.params.id),
    String(req.params.imageId),
    requireUser(req).id,
  );
  noContent(res);
});
