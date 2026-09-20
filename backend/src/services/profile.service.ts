import { prisma } from '../config/db';
import { ApiError } from '../utils/ApiError';
import { uploadImage } from './media.service';
import type { UpdateProfileInput } from '../validators/profile.validators';

// Requirement mapping (PROF-xx): 01 view own profile, 02 edit profile, 03 logo upload,
// 04 category interests (drives LISTING_MATCH notifications) + public seller/buyer view.

const ownSelect = {
  id: true,
  userId: true,
  companyName: true,
  logoUrl: true,
  industry: true,
  location: true,
  phone: true,
  description: true,
  isVerified: true,
  createdAt: true,
  updatedAt: true,
  categoryInterests: { select: { category: { select: { id: true, name: true, slug: true } } } },
} as const;

const flattenInterests = <T extends { categoryInterests: { category: unknown }[] }>(p: T) => ({
  ...p,
  categoryInterests: p.categoryInterests.map((i) => i.category),
});

/** PROF-01 */
export const getOwnProfile = async (userId: string) => {
  const profile = await prisma.businessProfile.findUnique({
    where: { userId },
    select: ownSelect,
  });
  if (!profile) throw ApiError.notFound('Business profile not found');
  return flattenInterests(profile);
};

/** PROF-02 */
export const updateOwnProfile = async (userId: string, input: UpdateProfileInput) => {
  const existing = await prisma.businessProfile.findUnique({ where: { userId } });
  if (!existing) throw ApiError.notFound('Business profile not found');
  const profile = await prisma.businessProfile.update({
    where: { userId },
    data: input,
    select: ownSelect,
  });
  return flattenInterests(profile);
};

/** PROF-03 */
export const setLogo = async (userId: string, file: Express.Multer.File | undefined) => {
  if (!file) throw ApiError.badRequest('Attach an image in the "logo" field');
  const existing = await prisma.businessProfile.findUnique({ where: { userId } });
  if (!existing) throw ApiError.notFound('Business profile not found');
  const logoUrl = await uploadImage(file.buffer, 'logos');
  await prisma.businessProfile.update({ where: { userId }, data: { logoUrl } });
  return { logoUrl };
};

/** PROF-04: replaces the full interest set atomically. */
export const setInterests = async (userId: string, categoryIds: string[]) => {
  const profile = await prisma.businessProfile.findUnique({ where: { userId } });
  if (!profile) throw ApiError.notFound('Business profile not found');

  const unique = [...new Set(categoryIds)];
  const found = await prisma.category.count({ where: { id: { in: unique } } });
  if (found !== unique.length) throw ApiError.badRequest('One or more categories do not exist');

  await prisma.$transaction([
    prisma.categoryInterest.deleteMany({ where: { businessProfileId: profile.id } }),
    prisma.categoryInterest.createMany({
      data: unique.map((categoryId) => ({ businessProfileId: profile.id, categoryId, userId })),
    }),
  ]);
  return getOwnProfile(userId);
};

/** Public view of another business: no phone, only active accounts. */
export const getPublicProfile = async (userId: string) => {
  const profile = await prisma.businessProfile.findFirst({
    where: { userId, user: { isActive: true } },
    select: {
      userId: true,
      companyName: true,
      logoUrl: true,
      industry: true,
      location: true,
      description: true,
      isVerified: true,
      user: { select: { role: true } },
    },
  });
  if (!profile) throw ApiError.notFound('Business profile not found');
  const { user, ...rest } = profile;
  return { ...rest, role: user.role };
};
