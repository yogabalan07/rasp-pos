/**
 * Base API Client Abstraction for YB INVENTORY & POS.
 *
 * Phase 1: every real call goes to the local FastAPI service on the Raspberry
 * Pi (`/api`, proxied to 127.0.0.1:8000 in dev, served by Nginx in prod).
 * Authentication rides on an HttpOnly `yb_session` cookie, so `credentials`
 * is always `include`.
 *
 * The response envelope mirrors the server:
 *   success -> { ok: true,  data, message }
 *   failure -> { ok: false, data: null, message }  (+ HTTP status)
 *
 * `delay` / `createResponse` remain for the mock-only services that are out of
 * Phase 1 scope (customers, suppliers, sync, server monitor).
 */

export interface ApiResponse<T> {
  data: T;
  success: boolean;
  message?: string;
  source: 'LOCAL_EDGE' | 'CLOUD_FIRESTORE' | 'CACHE';
}

export const delay = (ms: number = 80): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, ms));

export function createResponse<T>(data: T, message?: string): ApiResponse<T> {
  return {
    data,
    success: true,
    message,
    source: 'LOCAL_EDGE',
  };
}

// ------------------------------------------------------------------ base

export const API_BASE = '/api';

const DEVICE_ID_STORAGE_KEY = 'yb_device_id';

/**
 * Stable per-terminal id, created once and kept in localStorage so retries of
 * the same physical sale are recognised as idempotent by the server.
 */
export function getDeviceId(): string {
  try {
    const existing = window.localStorage.getItem(DEVICE_ID_STORAGE_KEY);
    if (existing) return existing;
    const generated = `POS-${crypto.randomUUID()}`;
    window.localStorage.setItem(DEVICE_ID_STORAGE_KEY, generated);
    return generated;
  } catch {
    // Private mode / storage disabled: fall back to a session-scoped id.
    return 'POS-ephemeral';
  }
}

/** Raised for any non-2xx API response. `status` is the HTTP status. */
export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/** Broadcast when the server says the session is gone (401). */
export const UNAUTHORIZED_EVENT = 'yb:unauthorized';

interface Envelope<T> {
  ok: boolean;
  data: T | null;
  message?: string;
}

function buildUrl(path: string, params?: Record<string, string | number | boolean | undefined>): string {
  const url = `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
  if (!params) return url;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '') continue;
    query.set(key, String(value));
  }
  const qs = query.toString();
  return qs ? `${url}?${qs}` : url;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  params?: Record<string, string | number | boolean | undefined>,
): Promise<ApiResponse<T>> {
  let response: Response;
  try {
    response = await fetch(buildUrl(path, params), {
      method,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-Device-Id': getDeviceId(),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError('Cannot reach the local POS server', 0);
  }

  let envelope: Envelope<T> | null = null;
  try {
    envelope = (await response.json()) as Envelope<T>;
  } catch {
    envelope = null;
  }

  if (!response.ok || !envelope?.ok) {
    const message = envelope?.message || `Request failed (${response.status})`;
    if (response.status === 401) {
      window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT));
    }
    throw new ApiError(message, response.status);
  }

  return {
    data: envelope.data as T,
    success: true,
    message: envelope.message,
    source: 'LOCAL_EDGE',
  };
}

export function apiGet<T>(
  path: string,
  params?: Record<string, string | number | boolean | undefined>,
): Promise<ApiResponse<T>> {
  return request<T>('GET', path, undefined, params);
}

export function apiPost<T>(path: string, body?: unknown): Promise<ApiResponse<T>> {
  return request<T>('POST', path, body);
}

export function apiPatch<T>(path: string, body?: unknown): Promise<ApiResponse<T>> {
  return request<T>('PATCH', path, body);
}

export function apiDelete<T>(path: string): Promise<ApiResponse<T>> {
  return request<T>('DELETE', path);
}
