'use client';

import { createContext, useCallback, useContext, useSyncExternalStore } from 'react';
import { apiFetch } from '@/lib/api-client';
import {
  clearSession,
  getServerSnapshot,
  getSession,
  setSession,
  subscribe,
  type StoredSession,
} from '@/lib/auth-storage';
import type { PublicUser } from '@/types/user';

interface AuthContextValue {
  user: PublicUser | null;
  /** Called by the login/register screens once the API returns a session. */
  applySession: (session: StoredSession) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  // Subscribes to auth-storage directly: SSR and first client paint both use
  // getServerSnapshot (logged-out), then React re-renders with the real session right
  // after hydration — no manual effect/setState dance needed for that swap.
  const session = useSyncExternalStore(subscribe, getSession, getServerSnapshot);

  const applySession = useCallback((next: StoredSession) => {
    setSession(next);
  }, []);

  const logout = useCallback(async () => {
    const current = getSession();
    clearSession();
    if (!current) return;
    // Best-effort: revoke the refresh token server-side, but don't block logging out
    // locally if the network call fails.
    await apiFetch('/auth/logout', {
      method: 'POST',
      body: { refreshToken: current.refreshToken },
      auth: false,
    }).catch(() => undefined);
  }, []);

  return (
    <AuthContext.Provider value={{ user: session?.user ?? null, applySession, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
};
