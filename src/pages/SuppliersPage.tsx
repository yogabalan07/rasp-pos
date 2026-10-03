import React, { useState, useEffect } from 'react';
import { Supplier } from '../types';
import { suppliersService } from '../services/suppliers';
import { useApp } from '../context/AppContext';
import { 
  Building2, 
  Phone, 
  Mail, 
  MapPin, 
  Plus, 
  Search, 
  X,
  CreditCard,
  FileText
} from 'lucide-react';

export const SuppliersPage: React.FC = () => {
  const { showToast, navigateTo } = useApp();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);

  // New Supplier Form
  const [name, setName] = useState('');
  const [gstin, setGstin] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [creditLimit, setCreditLimit] = useState('100000');
  const [paymentTerms, setPaymentTerms] = useState('Net 30 Days');
  const [contactPerson, setContactPerson] = useState('');

  useEffect(() => {
    loadSuppliers();
  }, []);

  const loadSuppliers = async () => {
    const res = await suppliersService.getAll();
    setSuppliers(res.data);
  };

  const handleAddSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    // Add to suppliers list
    const newSup: Supplier = {
      id: `sup-${Date.now()}`,
      name: name.trim(),
      gstin: gstin.trim() || 'Unregistered',
      phone: phone.trim(),
      email: email.trim(),
      address: address.trim(),
      creditLimit: parseFloat(creditLimit) || 50000,
      outstandingBalance: 0,
      paymentTerms,
      contactPerson: contactPerson.trim(),
    };

    setSuppliers(prev => [newSup, ...prev]);
    showToast(`Supplier ${newSup.name} added`, 'success');
    setIsModalOpen(false);
  };

  const filtered = suppliers.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.contactPerson.toLowerCase().includes(search.toLowerCase()) ||
    s.phone.includes(search)
  );

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white">
            Suppliers &amp; Vendors
          </h1>
          <p className="text-xs text-neutral-500">
            Vendor accounts, payment terms, and credit balance ledgers
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-1.5 rounded-lg bg-neutral-900 px-4 py-2 text-xs font-semibold text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-950 transition-colors"
        >
          <Plus className="h-4 w-4" />
          <span>Add Supplier</span>
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
            placeholder="Search suppliers by name, contact person, or phone..."
            className="w-full rounded-lg border border-neutral-200 bg-neutral-50 pl-9 pr-3 py-1.5 text-xs focus:bg-white focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
          />
        </div>
      </div>

      {/* Grid of Supplier Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {filtered.map(sup => (
          <div
            key={sup.id}
            className="flex flex-col justify-between rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900"
          >
            <div>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-neutral-900 dark:text-white">{sup.name}</h3>
                  <p className="text-xs text-neutral-500">{sup.contactPerson}</p>
                </div>
                <span className="rounded bg-neutral-100 px-2 py-0.5 text-[10px] font-bold text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
                  {sup.paymentTerms}
                </span>
              </div>

              <div className="mt-3 space-y-1.5 text-xs text-neutral-600 dark:text-neutral-400">
                <div className="flex items-center gap-2">
                  <Phone className="h-3.5 w-3.5 text-neutral-400" />
                  <span className="font-mono text-[11px]">{sup.phone}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Mail className="h-3.5 w-3.5 text-neutral-400" />
                  <span>{sup.email}</span>
                </div>
                <div className="flex items-center gap-2">
                  <MapPin className="h-3.5 w-3.5 text-neutral-400" />
                  <span className="truncate">{sup.address}</span>
                </div>
                <div className="flex items-center gap-2 text-[11px] font-mono text-neutral-500 pt-1">
                  <span>GSTIN: {sup.gstin}</span>
                </div>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between border-t border-neutral-100 pt-3 dark:border-neutral-800">
              <div>
                <span className="text-[10px] text-neutral-400">Outstanding Payable</span>
                <p className="text-sm font-bold font-tabular text-red-600">₹{sup.outstandingBalance.toLocaleString('en-IN')}</p>
              </div>

              <button
                onClick={() => navigateTo('/purchases')}
                className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300"
              >
                Create PO
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Add Supplier Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="flex flex-col w-full max-w-lg rounded-xl border border-neutral-200 bg-white shadow-2xl dark:border-neutral-800 dark:bg-neutral-900">
            <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-3.5 dark:border-neutral-800">
              <h2 className="text-base font-bold text-neutral-900 dark:text-white">Add New Supplier</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-neutral-400 hover:text-neutral-700 p-1">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleAddSupplier} className="p-5 space-y-3">
              <div>
                <label className="text-xs font-semibold">Vendor Company Name *</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. Parle Agro Logistics"
                  className="mt-1 w-full rounded border border-neutral-300 p-2 text-xs dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-semibold">Contact Person</label>
                  <input
                    type="text"
                    value={contactPerson}
                    onChange={e => setContactPerson(e.target.value)}
                    className="mt-1 w-full rounded border border-neutral-300 p-2 text-xs dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold">GSTIN</label>
                  <input
                    type="text"
                    value={gstin}
                    onChange={e => setGstin(e.target.value)}
                    placeholder="29AAAAA0000A1Z5"
                    className="mt-1 w-full rounded border border-neutral-300 p-2 text-xs font-mono dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-semibold">Phone Number</label>
                  <input
                    type="text"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    className="mt-1 w-full rounded border border-neutral-300 p-2 text-xs dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="mt-1 w-full rounded border border-neutral-300 p-2 text-xs dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                  />
                </div>
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
                  <label className="text-xs font-semibold">Payment Terms</label>
                  <select
                    value={paymentTerms}
                    onChange={e => setPaymentTerms(e.target.value)}
                    className="mt-1 w-full rounded border border-neutral-300 p-2 text-xs dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                  >
                    <option value="Net 15 Days">Net 15 Days</option>
                    <option value="Net 30 Days">Net 30 Days</option>
                    <option value="Weekly Settlement">Weekly Settlement</option>
                    <option value="Cash on Delivery">Cash on Delivery</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold">Warehouse / Office Address</label>
                <input
                  type="text"
                  value={address}
                  onChange={e => setAddress(e.target.value)}
                  className="mt-1 w-full rounded border border-neutral-300 p-2 text-xs dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                />
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
                  Save Supplier
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
