import bcrypt from 'bcrypt';
import { prisma } from '../src/config/db';
import { env } from '../src/config/env';

const CATEGORIES = [
  'Electronics',
  'Furniture',
  'Apparel & Textiles',
  'Food & Beverage',
  'Industrial Equipment',
  'Building Materials',
  'Office Supplies',
  'Health & Beauty',
  'Automotive Parts',
  'Toys & Games',
  'Home & Kitchen',
  'Packaging',
];

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

async function main() {
  for (const name of CATEGORIES) {
    await prisma.category.upsert({
      where: { slug: slugify(name) },
      update: {},
      create: { name, slug: slugify(name) },
    });
  }
  console.log(`Seeded ${CATEGORIES.length} categories`);

  if (env.SEED_ADMIN_EMAIL && env.SEED_ADMIN_PASSWORD) {
    const email = env.SEED_ADMIN_EMAIL.toLowerCase();
    const passwordHash = await bcrypt.hash(env.SEED_ADMIN_PASSWORD, 12);
    await prisma.user.upsert({
      where: { email },
      // Never overwrite an existing admin's password on re-seed.
      update: {},
      create: { email, passwordHash, role: 'ADMIN', isEmailVerified: true },
    });
    console.log(`Admin user ensured: ${email}`);
  } else {
    console.log('SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD not set: skipping admin user');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
