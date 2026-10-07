import { clearSession, getSession, setSession } from './auth-storage';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';

export interface ApiErrorBody {
  code: string;
  message: string;
  details?: unknown;
}

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

// Mirrors backend/src/middlewares/error.middleware.ts and utils/ApiResponse.ts exactly —
// every response is either { success: true, data } or { success: false, error }, with an
// optional meta alongside data on paginated endpoints.
type ApiEnvelope<T> =
  | { success: true; data: T; meta?: PageMeta }
  | { success: false; error: ApiErrorBody };

export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  /** Attach the stored access token as a Bearer header. Default true. */
  auth?: boolean;
  signal?: AbortSignal;
}

const rawRequest = async <T>(
  path: string,
  options: RequestOptions,
  accessToken?: string,
): Promise<{ data: T; meta?: PageMeta }> => {
  const res = await fetch(`${API_URL}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    signal: options.signal,
  });

  // 204 No Content (e.g. logout) has no body to parse.
  if (res.status === 204) return { data: undefined as T };

  const json = (await res.json().catch(() => null)) as ApiEnvelope<T> | null;
  if (!json) {
    throw new ApiClientError(res.status, 'INTERNAL_ERROR', 'Unexpected response from server');
  }
  if (!json.success) {
    throw new ApiClientError(res.status, json.error.code, json.error.message, json.error.details);
  }
  return { data: json.data, meta: json.meta };
};

// Concurrent 401s during the same refresh share one in-flight request instead of each
// firing its own /auth/refresh call.
let refreshing: Promise<string | null> | null = null;

const refreshAccessToken = async (): Promise<string | null> => {
  const session = getSession();
  if (!session) return null;

  if (!refreshing) {
    refreshing = rawRequest<{ accessToken: string; refreshToken: string }>('/auth/refresh', {
      method: 'POST',
      body: { refreshToken: session.refreshToken },
    })
      .then(({ data: tokens }) => {
        setSession({ ...session, ...tokens });
        return tokens.accessToken;
      })
      .catch(() => {
        clearSession();
        return null;
      })
      .finally(() => {
        refreshing = null;
      });
  }
  return refreshing;
};

/**
 * Calls the STOCKBID API, attaching the stored access token by default. On a 401 from an
 * authenticated call, transparently refreshes once and retries before giving up — the caller
 * never sees the expired-token round trip, only the eventual success or final failure.
 */
const fetchEnvelope = async <T>(
  path: string,
  options: RequestOptions = {},
): Promise<{ data: T; meta?: PageMeta }> => {
  const wantsAuth = options.auth !== false;
  const session = wantsAuth ? getSession() : null;

  try {
    return await rawRequest<T>(path, options, session?.accessToken);
  } catch (err) {
    const expired = err instanceof ApiClientError && err.status === 401 && wantsAuth && session;
    if (!expired) throw err;

    const newAccessToken = await refreshAccessToken();
    if (!newAccessToken) throw err; // refresh failed too; surface the original 401

    return rawRequest<T>(path, options, newAccessToken);
  }
};

export const apiFetch = async <T>(path: string, options: RequestOptions = {}): Promise<T> =>
  (await fetchEnvelope<T>(path, options)).data;

/** Same as apiFetch, but also returns the pagination meta a list endpoint sends alongside data. */
export const apiFetchPage = async <T>(
  path: string,
  options: RequestOptions = {},
): Promise<{ data: T; meta: PageMeta }> => {
  const { data, meta } = await fetchEnvelope<T>(path, options);
  if (!meta) throw new Error(`Expected pagination meta from ${path}`);
  return { data, meta };
};
