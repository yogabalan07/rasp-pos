import React, { useState, useEffect } from 'react';
import { Customer } from '../types';
import { customersService } from '../services/customers';
import { useApp } from '../context/AppContext';
import { 
  Users, 
  Phone, 
  Mail, 
  MapPin, 
  Plus, 
  Search, 
  Award, 
  CreditCard, 
  X,
  History
} from 'lucide-react';

export const CustomersPage: React.FC = () => {
  const { showToast, navigateTo } = useApp();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);

  // New Customer Form
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [creditLimit, setCreditLimit] = useState('5000');

  useEffect(() => {
    loadCustomers();
  }, []);

  const loadCustomers = async () => {
    const res = await customersService.getAll();
    setCustomers(res.data);
  };

  const handleAddCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) return;

    await customersService.create({
      name: name.trim(),
      phone: phone.trim(),
      email: email.trim() || undefined,
      address: address.trim() || undefined,
      outstandingBalance: 0,
      creditLimit: parseFloat(creditLimit) || 5000,
    });

    showToast(`Customer ${name} added successfully`, 'success');
    setIsModalOpen(false);
    loadCustomers();
  };

  const filtered = customers.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.phone.includes(search)
  );

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white">
            Customer Profiles &amp; Loyalty
          </h1>
          <p className="text-xs text-neutral-500">
            Customer directory, loyalty points balance, purchase history, and khata credit
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-1.5 rounded-lg bg-neutral-900 px-4 py-2 text-xs font-semibold text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-950 transition-colors"
        >
          <Plus className="h-4 w-4" />
          <span>New Customer</span>
        </button>
      </div>

      {/* Search */}
      <div className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-neutral-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search customers by name or phone..."
            className="w-full rounded-lg border border-neutral-200 bg-neutral-50 pl-9 pr-3 py-1.5 text-xs focus:bg-white focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
          />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-[11px] font-semibold text-neutral-500 dark:border-neutral-800 dark:bg-neutral-800/50">
            <tr>
              <th className="py-3 px-4">Customer Name</th>
              <th className="py-3 px-4">Phone / Email</th>
              <th className="py-3 px-4 text-center">Total Bills</th>
              <th className="py-3 px-4 text-right">Total Spent</th>
              <th className="py-3 px-4 text-center">Loyalty Points</th>
              <th className="py-3 px-4 text-right">Khata Due</th>
              <th className="py-3 px-4 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {filtered.map(c => (
              <tr key={c.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/40">
                <td className="py-3 px-4">
                  <p className="font-bold text-neutral-900 dark:text-white">{c.name}</p>
                  {c.address && <p className="text-[10px] text-neutral-400 truncate max-w-xs">{c.address}</p>}
                </td>
                <td className="py-3 px-4 text-neutral-600 dark:text-neutral-400 font-mono text-[11px]">
                  <p>{c.phone}</p>
                  {c.email && <p className="text-[10px] text-neutral-400">{c.email}</p>}
                </td>
                <td className="py-3 px-4 text-center font-tabular">
                  {c.totalBills}
                </td>
                <td className="py-3 px-4 text-right font-bold font-tabular text-neutral-900 dark:text-white">
                  ₹{c.totalSpent.toLocaleString('en-IN')}
                </td>
                <td className="py-3 px-4 text-center font-mono">
                  {c.loyaltyPoints > 0 ? (
                    <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-800 border border-amber-200 dark:bg-amber-950/40 dark:border-amber-800 dark:text-amber-300">
                      <Award className="h-3 w-3 text-amber-600" />
                      {c.loyaltyPoints} pts
                    </span>
                  ) : (
                    <span className="text-neutral-400">0</span>
                  )}
                </td>
                <td className="py-3 px-4 text-right font-bold font-tabular">
                  {c.outstandingBalance > 0 ? (
                    <span className="text-red-600">₹{c.outstandingBalance.toFixed(2)}</span>
                  ) : (
                    <span className="text-emerald-700">₹0.00</span>
                  )}
                </td>
                <td className="py-3 px-4 text-right space-x-1">
                  {c.outstandingBalance > 0 && (
                    <button
                      onClick={() => navigateTo('/credit')}
                      className="rounded bg-neutral-900 px-2.5 py-1 text-xs font-semibold text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-950"
                    >
                      Collect Dues
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add Customer Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="flex flex-col w-full max-w-md rounded-xl border border-neutral-200 bg-white shadow-2xl dark:border-neutral-800 dark:bg-neutral-900">
            <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-3.5 dark:border-neutral-800">
              <h2 className="text-base font-bold text-neutral-900 dark:text-white">Add Customer</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-neutral-400 hover:text-neutral-700 p-1">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleAddCustomer} className="p-5 space-y-3">
              <div>
                <label className="text-xs font-semibold">Customer Full Name *</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. Ramesh Babu"
                  className="mt-1 w-full rounded border border-neutral-300 p-2 text-xs dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                />
              </div>

              <div>
                <label className="text-xs font-semibold">Phone Number (10 Digits) *</label>
                <input
                  type="text"
                  required
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="+91 98450 11223"
                  className="mt-1 w-full rounded border border-neutral-300 p-2 text-xs font-mono dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                />
              </div>

              <div>
                <label className="text-xs font-semibold">Email Address (Optional)</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="mt-1 w-full rounded border border-neutral-300 p-2 text-xs dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-semibold">Credit Limit (₹)</label>
                  <input
                    type="number"
                    value={creditLimit}
                    onChange={e => setCreditLimit(e.target.value)}
                    className="mt-1 w-full rounded border border-neutral-300 p-2 text-xs dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold">Address / Locality</label>
                  <input
                    type="text"
                    value={address}
                    onChange={e => setAddress(e.target.value)}
                    className="mt-1 w-full rounded border border-neutral-300 p-2 text-xs dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-neutral-100 dark:border-neutral-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-lg border border-neutral-300 px-4 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-emerald-600 px-5 py-2 text-xs font-bold text-white hover:bg-emerald-700"
                >
                  Save Customer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
