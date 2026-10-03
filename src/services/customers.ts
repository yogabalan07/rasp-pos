import { Customer } from '../types';
import { INITIAL_CUSTOMERS } from '../data/mockData';
import { delay, createResponse, ApiResponse } from './api';

let customers: Customer[] = [...INITIAL_CUSTOMERS];

export const customersService = {
  async getAll(): Promise<ApiResponse<Customer[]>> {
    await delay();
    return createResponse([...customers]);
  },

  async getById(id: string): Promise<ApiResponse<Customer | null>> {
    await delay();
    return createResponse(customers.find(c => c.id === id) || null);
  },

  async create(data: Omit<Customer, 'id' | 'totalBills' | 'totalSpent' | 'loyaltyPoints'>): Promise<ApiResponse<Customer>> {
    await delay();
    const customer: Customer = {
      ...data,
      id: `cust-${Date.now()}`,
      loyaltyPoints: 0,
      totalBills: 0,
      totalSpent: 0,
    };
    customers.push(customer);
    return createResponse(customer, 'Customer added');
  },

  async collectPayment(customerId: string, amount: number, notes?: string): Promise<ApiResponse<Customer>> {
    await delay();
    const cust = customers.find(c => c.id === customerId);
    if (!cust) throw new Error('Customer not found');
    cust.outstandingBalance = Math.max(0, cust.outstandingBalance - amount);
    return createResponse(cust, `Payment of ₹${amount} recorded`);
  }
};
