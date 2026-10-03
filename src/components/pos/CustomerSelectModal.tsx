import React, { useState } from 'react';
import { Customer } from '../../types';
import { Search, UserPlus, Check, X, Phone, UserCheck } from 'lucide-react';
import { useApp } from '../../context/AppContext';

interface CustomerSelectModalProps {
  isOpen: boolean;
  customers: Customer[];
  selectedCustomerId?: string;
  onClose: () => void;
  onSelectCustomer: (customer: Customer) => void;
  onCreateCustomer: (customer: Omit<Customer, 'id' | 'totalBills' | 'totalSpent' | 'loyaltyPoints'>) => Promise<void>;
}

export const CustomerSelectModal: React.FC<CustomerSelectModalProps> = ({
  isOpen,
  customers,
  selectedCustomerId,
  onClose,
  onSelectCustomer,
  onCreateCustomer,
}) => {
  const { showToast } = useApp();
  const [search, setSearch] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [newLimit, setNewLimit] = useState('5000');

  if (!isOpen) return null;

  const filtered = customers.filter(c => 
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.phone.includes(search)
  );

  const handleAddNew = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newPhone.trim()) {
      showToast('Name and phone are required', 'warning');
      return;
    }
    await onCreateCustomer({
      name: newName.trim(),
      phone: newPhone.trim(),
      address: newAddress.trim() || undefined,
      creditLimit: parseFloat(newLimit) || 5000,
      outstandingBalance: 0,
    });
    setShowAddForm(false);
    setNewName('');
    setNewPhone('');
    setNewAddress('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div className="flex flex-col w-full max-w-lg rounded-xl border border-neutral-200 bg-white shadow-2xl dark:border-neutral-800 dark:bg-neutral-900 max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-3.5 dark:border-neutral-800">
          <div>
            <h2 className="text-base font-bold text-neutral-900 dark:text-white">Select Customer (F3)</h2>
            <p className="text-xs text-neutral-500">Attach customer to current bill for loyalty &amp; khata credit</p>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-neutral-400 hover:text-neutral-700 dark:hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Search & Actions Bar */}
        <div className="p-4 border-b border-neutral-100 dark:border-neutral-800 flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-neutral-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by customer name or phone..."
              autoFocus
              className="w-full rounded-lg border border-neutral-300 bg-neutral-50 pl-9 pr-3 py-2 text-xs focus:bg-white focus:border-neutral-900 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:focus:bg-neutral-900 dark:text-white"
            />
          </div>

          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="flex items-center gap-1 rounded-lg bg-neutral-900 px-3 py-2 text-xs font-semibold text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-950"
          >
            <UserPlus className="h-3.5 w-3.5" />
            <span>{showAddForm ? 'Cancel' : 'New'}</span>
          </button>
        </div>

        {/* Add Customer Form */}
        {showAddForm && (
          <form onSubmit={handleAddNew} className="p-4 bg-neutral-50 border-b border-neutral-200 dark:bg-neutral-800/40 dark:border-neutral-700 space-y-3">
            <h3 className="text-xs font-bold text-neutral-900 dark:text-white">Quick Add Customer</h3>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                placeholder="Full Name *"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                className="rounded border border-neutral-300 p-2 text-xs bg-white dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
              />
              <input
                type="text"
                placeholder="Phone (10 digits) *"
                value={newPhone}
                onChange={e => setNewPhone(e.target.value)}
                className="rounded border border-neutral-300 p-2 text-xs bg-white dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                placeholder="Address / Locality (Optional)"
                value={newAddress}
                onChange={e => setNewAddress(e.target.value)}
                className="rounded border border-neutral-300 p-2 text-xs bg-white dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
              />
              <input
                type="number"
                placeholder="Credit Limit (₹)"
                value={newLimit}
                onChange={e => setNewLimit(e.target.value)}
                className="rounded border border-neutral-300 p-2 text-xs bg-white dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
              />
            </div>
            <button
              type="submit"
              className="w-full rounded bg-emerald-600 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
            >
              Save &amp; Select Customer
            </button>
          </form>
        )}

        {/* Customer List */}
        <div className="flex-1 overflow-y-auto p-2 divide-y divide-neutral-100 dark:divide-neutral-800">
          {filtered.map(c => {
            const isSelected = c.id === selectedCustomerId;
            return (
              <div
                key={c.id}
                onClick={() => {
                  onSelectCustomer(c);
                  onClose();
                }}
                className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors ${
                  isSelected
                    ? 'bg-neutral-100 dark:bg-neutral-800 font-semibold'
                    : 'hover:bg-neutral-50 dark:hover:bg-neutral-800/50'
                }`}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-neutral-900 dark:text-white">{c.name}</span>
                    {c.loyaltyPoints > 0 && (
                      <span className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-1.5 rounded font-mono">
                        {c.loyaltyPoints} pts
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-neutral-500 mt-0.5">
                    <span className="flex items-center gap-1 font-mono">
                      <Phone className="h-3 w-3 text-neutral-400" />
                      {c.phone}
                    </span>
                    {c.outstandingBalance > 0 && (
                      <span className="text-red-600 font-semibold font-tabular">
                        Khata Due: ₹{c.outstandingBalance.toFixed(2)}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {isSelected ? (
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-white">
                      <Check className="h-3 w-3" />
                    </span>
                  ) : (
                    <button className="text-xs font-medium text-neutral-500 hover:text-neutral-900 dark:hover:text-white">
                      Select
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
