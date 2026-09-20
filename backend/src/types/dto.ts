import type { Role } from '@prisma/client';
import type { PageMeta } from '../utils/ApiResponse';

/** User shape returned by the API: never includes passwordHash. */
export interface PublicUser {
  id: string;
  email: string;
  role: Role;
  isEmailVerified: boolean;
  createdAt: Date;
  companyName: string | null;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResult extends TokenPair {
  user: PublicUser;
}

export interface Paginated<T> {
  items: T[];
  meta: PageMeta;
}
