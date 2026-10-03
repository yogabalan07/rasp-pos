import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { 
  Tag, 
  Plus, 
  Sparkles, 
  Check, 
  Calendar, 
  Clock, 
  Percent, 
  Coins, 
  Gift,
  X
} from 'lucide-react';

interface Offer {
  id: string;
  name: string;
  type: 'PERCENTAGE' | 'FIXED' | 'BOGO' | 'COUPON' | 'FESTIVAL';
  value: string;
  code?: string;
  minBillAmount?: number;
  validTill: string;
  status: 'ACTIVE' | 'SCHEDULED' | 'EXPIRED';
}

export const OffersPage: React.FC = () => {
  const { showToast } = useApp();
  const [offers, setOffers] = useState<Offer[]>([
    { id: 'off-1', name: 'Diwali Festival Grand Basket', type: 'PERCENTAGE', value: '10% OFF on Bills > ₹2,000', code: 'DIWALI26', minBillAmount: 2000, validTill: '31 Oct 2026', status: 'ACTIVE' },
    { id: 'off-2', name: 'Buy 2 Get 1 Coca Cola 750ml', type: 'BOGO', value: 'Buy 2 Get 1 Free', validTill: '15 Oct 2026', status: 'ACTIVE' },
    { id: 'off-3', name: 'Weekend Staples Cashback', type: 'FIXED', value: '₹50 Flat OFF on Atta 5kg', validTill: '12 Oct 2026', status: 'ACTIVE' },
    { id: 'off-4', name: 'First Time Customer Welcome', type: 'COUPON', value: '5% OFF First Bill', code: 'WELCOME5', validTill: '31 Dec 2026', status: 'ACTIVE' },
  ]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<Offer['type']>('PERCENTAGE');
  const [value, setValue] = useState('');
  const [code, setCode] = useState('');
  const [validTill, setValidTill] = useState('2026-10-31');

  const handleCreateOffer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const newOffer: Offer = {
      id: `off-${Date.now()}`,
      name: name.trim(),
      type,
      value: value.trim(),
      code: code.trim() || undefined,
      validTill,
      status: 'ACTIVE',
    };

    setOffers(prev => [newOffer, ...prev]);
    showToast(`Promotion ${newOffer.name} launched`, 'success');
    setIsModalOpen(false);
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white">
            Discounts, Offers &amp; Coupons
          </h1>
          <p className="text-xs text-neutral-500">
            Configure automated BOGO deals, festival coupons, and bill discount campaigns
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 shadow-xs transition-colors"
        >
          <Plus className="h-4 w-4" />
          <span>Create Promotion</span>
        </button>
      </div>

      {/* Offers Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {offers.map(off => (
          <div
            key={off.id}
            className="flex flex-col justify-between rounded-xl border border-neutral-200 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900"
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded dark:bg-emerald-950/40 dark:text-emerald-300">
                  <Tag className="h-3 w-3" />
                  {off.type}
                </span>
                <span className="text-[10px] font-bold text-neutral-500 font-mono">Active</span>
              </div>

              <h3 className="text-sm font-bold text-neutral-900 dark:text-white mt-2 leading-tight">
                {off.name}
              </h3>
              <p className="text-xs font-bold text-emerald-600 mt-1">{off.value}</p>

              {off.code && (
                <div className="mt-3 inline-block rounded border border-dashed border-neutral-300 bg-neutral-50 px-2.5 py-1 text-xs font-mono font-bold text-neutral-800 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200">
                  CODE: {off.code}
                </div>
              )}
            </div>

            <div className="mt-4 pt-3 border-t border-neutral-100 text-[11px] text-neutral-400 flex items-center justify-between dark:border-neutral-800">
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                Valid till {off.validTill}
              </span>
              <button 
                onClick={() => {
                  setOffers(prev => prev.filter(o => o.id !== off.id));
                  showToast('Offer deactivated', 'info');
                }}
                className="text-neutral-400 hover:text-red-600"
              >
                Disable
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* New Offer Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="flex flex-col w-full max-w-md rounded-xl border border-neutral-200 bg-white shadow-2xl dark:border-neutral-800 dark:bg-neutral-900">
            <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-3.5 dark:border-neutral-800">
              <h2 className="text-base font-bold text-neutral-900 dark:text-white">Create New Offer</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-neutral-400 hover:text-neutral-700 p-1">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateOffer} className="p-5 space-y-3">
              <div>
                <label className="text-xs font-semibold">Promotion Title *</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. Weekend Grocery Bonanza"
                  className="mt-1 w-full rounded border border-neutral-300 p-2 text-xs dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-semibold">Offer Type</label>
                  <select
                    value={type}
                    onChange={e => setType(e.target.value as any)}
                    className="mt-1 w-full rounded border border-neutral-300 p-2 text-xs dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                  >
                    <option value="PERCENTAGE">Percentage (%) Off</option>
                    <option value="FIXED">Flat (₹) Discount</option>
                    <option value="BOGO">Buy 1 Get 1 Free</option>
                    <option value="COUPON">Coupon Code</option>
                    <option value="FESTIVAL">Festival Special</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold">Coupon Code (Optional)</label>
                  <input
                    type="text"
                    value={code}
                    onChange={e => setCode(e.target.value.toUpperCase())}
                    placeholder="e.g. SAVE10"
                    className="mt-1 w-full rounded border border-neutral-300 p-2 text-xs font-mono dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold">Discount Rule / Description *</label>
                <input
                  type="text"
                  required
                  value={value}
                  onChange={e => setValue(e.target.value)}
                  placeholder="e.g. 10% OFF on all billing above ₹1,000"
                  className="mt-1 w-full rounded border border-neutral-300 p-2 text-xs dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                />
              </div>

              <div>
                <label className="text-xs font-semibold">Valid Till</label>
                <input
                  type="date"
                  value={validTill}
                  onChange={e => setValidTill(e.target.value)}
                  className="mt-1 w-full rounded border border-neutral-300 p-2 text-xs font-mono dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
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
                  Launch Offer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
