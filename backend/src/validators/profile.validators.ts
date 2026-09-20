import { z } from 'zod';

// Empty strings from forms are treated as "clear this field".
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === '' ? null : v))
    .nullable();

export const updateProfileSchema = z
  .object({
    companyName: z.string().trim().min(2).max(120),
    industry: optionalText(100),
    location: optionalText(150),
    phone: z
      .string()
      .trim()
      .regex(/^\+?[0-9 ()-]{6,20}$/, 'Invalid phone number')
      .nullable(),
    description: optionalText(2000),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Provide at least one field to update');

export const setInterestsSchema = z.object({
  categoryIds: z.array(z.uuid()).max(30),
});

export const userIdParamSchema = z.object({ userId: z.uuid() });

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
