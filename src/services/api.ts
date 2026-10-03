/**
 * Base API Client Abstraction for YB INVENTORY & POS.
 * 
 * In production on the Raspberry Pi:
 * Requests route to http://localhost:8080/api (SQLite Edge Service).
 * In cloud mode:
 * Background sync coordinates with Firebase Firestore.
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
