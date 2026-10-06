export type Role = 'BUYER' | 'SELLER' | 'ADMIN';

// Matches toPublicUser() in backend/src/services/auth.service.ts
export interface PublicUser {
  id: string;
  email: string;
  role: Role;
  isEmailVerified: boolean;
  createdAt: string;
  companyName: string | null;
}
