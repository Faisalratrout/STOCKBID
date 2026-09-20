import { prisma } from '../config/db';

// ADM-02 (public read side): categories are managed by admins, listed publicly.
export const listCategories = () =>
  prisma.category.findMany({
    select: { id: true, name: true, slug: true },
    orderBy: { name: 'asc' },
  });
