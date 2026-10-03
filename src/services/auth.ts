import { User, Shift } from '../types';
import { ApiResponse, apiGet, apiPost, ApiError } from './api';

/** Shape returned by `/api/auth/*` for a signed-in user. */
export interface SessionUser {
  id: string;
  username: string;
  email: string | null;
  role: 'OWNER' | 'ADMIN' | 'CASHIER';
  displayName: string;
  permissions: string[];
  isActive: boolean;
  createdAt: string;
}

const MAIN_BRANCH_ID = 'br-1';
const MAIN_BRANCH_NAME = 'Indiranagar Flagship Store';

export function toAppUser(sessionUser: SessionUser): User {
  return {
    id: sessionUser.id,
    name: sessionUser.displayName || sessionUser.username,
    email: sessionUser.email || '',
    // The server never returns credential material.
    pin: '',
    role: sessionUser.role,
    branchId: MAIN_BRANCH_ID,
    branchName: MAIN_BRANCH_NAME,
    phone: '',
  };
}

let currentUser: User | null = null;
let currentPermissions: string[] = [];

/**
 * TODO(phase-2): shifts are still client-local demo state.
 * Phase 1 has no shift/dues API on the Pi.
 */
let currentShift: Shift = {
  id: 'shift-101',
  shiftNumber: 'SHIFT-2026-10-03-01',
  cashierId: 'usr-cashier',
  cashierName: 'Rohan Sharma',
  startTime: '08:00 AM',
  openingCash: 2000.00,
  cashSales: 1420.00,
  upiSales: 3840.00,
  cardSales: 1250.00,
  creditSales: 0,
  cashExpenses: 150.00,
  expectedCash: 3270.00,
  status: 'OPEN',
};

function adopt(sessionUser: SessionUser): User {
  currentUser = toAppUser(sessionUser);
  currentPermissions = sessionUser.permissions || [];
  return currentUser;
}

export const authService = {
  getCurrentUser(): User | null {
    return currentUser;
  },

  getPermissions(): string[] {
    return currentPermissions;
  },

  can(permission: string): boolean {
    return currentPermissions.includes(permission);
  },

  /** Restore the session from the HttpOnly cookie; returns null when signed out. */
  async fetchSession(): Promise<ApiResponse<User | null>> {
    try {
      const res = await apiGet<SessionUser>('/auth/session');
      if (!res.data) {
        currentUser = null;
        currentPermissions = [];
        return { data: null, success: true, source: 'LOCAL_EDGE' };
      }
      return { data: adopt(res.data), success: true, source: 'LOCAL_EDGE' };
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        currentUser = null;
        currentPermissions = [];
        return { data: null, success: true, source: 'LOCAL_EDGE' };
      }
      throw err;
    }
  },

  async login(identifier: string, password: string): Promise<ApiResponse<User>> {
    const res = await apiPost<SessionUser>('/auth/login', { identifier, password });
    return { data: adopt(res.data), success: true, message: res.message, source: 'LOCAL_EDGE' };
  },

  async loginWithPin(pin: string): Promise<ApiResponse<User>> {
    const res = await apiPost<SessionUser>('/auth/login/pin', { pin });
    return { data: adopt(res.data), success: true, message: res.message, source: 'LOCAL_EDGE' };
  },

  async logout(): Promise<void> {
    try {
      await apiPost('/auth/logout');
    } finally {
      currentUser = null;
      currentPermissions = [];
    }
  },

  async changePassword(currentPassword: string, newPassword: string): Promise<ApiResponse<null>> {
    const res = await apiPost<null>('/auth/change-password', {
      current_password: currentPassword,
      new_password: newPassword,
    });
    return res as ApiResponse<null>;
  },

  clearSession(): void {
    currentUser = null;
    currentPermissions = [];
  },

  getCurrentShift(): Shift {
    return currentShift;
  },

  closeShift(actualCash: number, notes?: string): Shift {
    const variance = actualCash - currentShift.expectedCash;
    currentShift = {
      ...currentShift,
      endTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      actualCash,
      variance,
      status: 'CLOSED',
      notes,
    };
    return currentShift;
  },

  openNewShift(openingCash: number): Shift {
    currentShift = {
      id: `shift-${Date.now()}`,
      shiftNumber: `SHIFT-${new Date().toISOString().slice(0, 10)}-${Date.now().toString().slice(-2)}`,
      cashierId: currentUser?.id || 'unknown',
      cashierName: currentUser?.name || 'Unknown',
      startTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      openingCash,
      cashSales: 0,
      upiSales: 0,
      cardSales: 0,
      creditSales: 0,
      cashExpenses: 0,
      expectedCash: openingCash,
      status: 'OPEN',
    };
    return currentShift;
  },
};
