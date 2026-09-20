import type { Role } from '@prisma/client';

export interface AuthUser {
  id: string;
  role: Role;
}

declare global {
  namespace Express {
    interface Request {
      /** Set by auth.middleware after JWT verification. */
      user?: AuthUser;
    }
  }
}
