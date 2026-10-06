import type { PublicUser } from '@/types/user';

export interface StoredSession {
  user: PublicUser;
  accessToken: string;
  refreshToken: string;
}

const STORAGE_KEY = 'stockbid.session';

// Next.js renders this module on the server too, where `window` doesn't exist —
// every read/write must no-op there instead of throwing.
const isBrowser = () => typeof window !== 'undefined';

const readFromStorage = (): StoredSession | null => {
  if (!isBrowser()) return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredSession;
  } catch {
    return null;
  }
};

// Cached so getSnapshot() returns a stable reference across calls — useSyncExternalStore
// re-renders whenever the snapshot reference changes, so re-parsing localStorage on every
// call would re-render in an infinite loop even when nothing actually changed.
let cached: StoredSession | null = readFromStorage();

type Listener = () => void;
const listeners = new Set<Listener>();
const notify = () => listeners.forEach((listener) => listener());

export const subscribe = (listener: Listener): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** For useSyncExternalStore and for non-React code (api-client) that needs the token now. */
export const getSession = (): StoredSession | null => cached;

/** The server has no localStorage, so SSR and first client hydration both render logged-out. */
export const getServerSnapshot = (): StoredSession | null => null;

export const setSession = (session: StoredSession): void => {
  if (!isBrowser()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  cached = session;
  notify();
};

export const clearSession = (): void => {
  if (!isBrowser()) return;
  window.localStorage.removeItem(STORAGE_KEY);
  cached = null;
  notify();
};
