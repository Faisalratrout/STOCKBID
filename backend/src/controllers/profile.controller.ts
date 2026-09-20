import { asyncHandler } from '../utils/asyncHandler';
import { ok } from '../utils/ApiResponse';
import { requireUser } from '../utils/requestUser';
import * as profileService from '../services/profile.service';

export const getMine = asyncHandler(async (req, res) => {
  ok(res, await profileService.getOwnProfile(requireUser(req).id));
});

export const updateMine = asyncHandler(async (req, res) => {
  ok(res, await profileService.updateOwnProfile(requireUser(req).id, req.body));
});

export const uploadLogo = asyncHandler(async (req, res) => {
  ok(res, await profileService.setLogo(requireUser(req).id, req.file));
});

export const setInterests = asyncHandler(async (req, res) => {
  ok(res, await profileService.setInterests(requireUser(req).id, req.body.categoryIds));
});

export const getPublic = asyncHandler(async (req, res) => {
  ok(res, await profileService.getPublicProfile(String(req.params.userId)));
});
