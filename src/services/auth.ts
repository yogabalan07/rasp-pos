import { User, UserRole, Shift } from '../types';
import { delay, createResponse, ApiResponse } from './api';

export const SYSTEM_USERS: User[] = [
  {
    id: 'usr-owner',
    name: 'Yogabalan K.',
    email: 'yogabalan2007yoga@gmail.com',
    pin: '9999',
    role: 'OWNER',
    avatarUrl: '/src/assets/images/avatar_cashier_1791045612424.jpg',
    branchId: 'br-1',
    branchName: 'Indiranagar Flagship',
    phone: '+91 98450 00111',
  },
  {
    id: 'usr-admin',
    name: 'Vikramaditya S.',
    email: 'admin@ybinventory.local',
    pin: '8888',
    role: 'ADMIN',
    branchId: 'br-1',
    branchName: 'Indiranagar Flagship',
    phone: '+91 98450 00222',
  },
  {
    id: 'usr-mgr',
    name: 'Karthik Rao',
    email: 'store.manager@ybinventory.local',
    pin: '5555',
    role: 'MANAGER',
    branchId: 'br-1',
    branchName: 'Indiranagar Flagship',
    phone: '+91 98450 00333',
  },
  {
    id: 'usr-cashier',
    name: 'Rohan Sharma',
    email: 'rohan.pos@ybinventory.local',
    pin: '1234',
    role: 'CASHIER',
    avatarUrl: '/src/assets/images/avatar_cashier_1791045612424.jpg',
    branchId: 'br-1',
    branchName: 'Indiranagar Flagship',
    phone: '+91 98450 00444',
  },
  {
    id: 'usr-inv',
    name: 'Santhosh M.',
    email: 'inventory@ybinventory.local',
    pin: '2222',
    role: 'INVENTORY_MANAGER',
    branchId: 'br-1',
    branchName: 'Indiranagar Flagship',
    phone: '+91 98450 00555',
  },
  {
    id: 'usr-acc',
    name: 'Meenakshi Iyer',
    email: 'finance@ybinventory.local',
    pin: '3333',
    role: 'ACCOUNTANT',
    branchId: 'br-1',
    branchName: 'Indiranagar Flagship',
    phone: '+91 98450 00666',
  }
];

let currentUser: User = SYSTEM_USERS[0]; // Start as Owner for full access

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
  cashExpenses: 150.00, // Tea/Coffee petty cash
  expectedCash: 3270.00,
  status: 'OPEN',
};

export const authService = {
  getCurrentUser(): User {
    return currentUser;
  },

  switchRole(role: UserRole): User {
    const user = SYSTEM_USERS.find(u => u.role === role) || currentUser;
    currentUser = { ...user };
    return currentUser;
  },

  async loginWithEmail(email: string, _password: string): Promise<ApiResponse<User>> {
    await delay(120);
    const user = SYSTEM_USERS.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (!user) throw new Error('Invalid email or password');
    currentUser = user;
    return createResponse(user, 'Logged in successfully');
  },

  async loginWithPin(pin: string): Promise<ApiResponse<User>> {
    await delay(100);
    const user = SYSTEM_USERS.find(u => u.pin === pin);
    if (!user) throw new Error('Invalid Cashier PIN. Hint: Try 1234, 9999, 8888, 5555');
    currentUser = user;
    return createResponse(user, `Welcome back, ${user.name}`);
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
      cashierId: currentUser.id,
      cashierName: currentUser.name,
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
  }
};
