import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { 
  FileText, 
  Printer, 
  Settings, 
  Check, 
  Eye, 
  QrCode,
  Store
} from 'lucide-react';

export const InvoicesPage: React.FC = () => {
  const { currentBranch, showToast } = useApp();
  const [template, setTemplate] = useState<'THERMAL_80' | 'THERMAL_58' | 'A4_TAX'>('THERMAL_80');
  const [showQr, setShowQr] = useState(true);
  const [showHsn, setShowHsn] = useState(true);
  const [footerNote, setFooterNote] = useState('Goods once sold can be exchanged within 7 days with bill.');

  const handleSave = () => {
    showToast('Invoice template settings saved', 'success');
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white">
          Invoice &amp; Receipt Templates
        </h1>
        <p className="text-xs text-neutral-500">
          Configure thermal receipt formatting, tax invoice layouts, and store branding
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Settings Panel */}
        <div className="rounded-xl border border-neutral-200 bg-white p-5 space-y-4 dark:border-neutral-800 dark:bg-neutral-900">
          <h3 className="text-sm font-bold text-neutral-900 dark:text-white flex items-center gap-2">
            <Settings className="h-4 w-4" />
            <span>Format Configuration</span>
          </h3>

          <div>
            <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
              Print Profile Layout
            </label>
            <div className="grid grid-cols-3 gap-1.5 mt-1.5 text-xs font-medium">
              {[
                { id: 'THERMAL_80', label: '80mm Roll' },
                { id: 'THERMAL_58', label: '58mm Roll' },
                { id: 'A4_TAX', label: 'A4 Page' },
              ].map(t => (
                <button
                  key={t.id}
                  onClick={() => setTemplate(t.id as any)}
                  className={`rounded-lg border p-2 text-center transition-colors ${
                    template === t.id
                      ? 'border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-neutral-950 font-bold'
                      : 'border-neutral-200 bg-neutral-50 text-neutral-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2 pt-2 border-t border-neutral-100 dark:border-neutral-800">
            <div className="flex items-center justify-between">
              <label className="text-xs text-neutral-700 dark:text-neutral-300">
                Print Dynamic UPI Payment QR Code
              </label>
              <input
                type="checkbox"
                checked={showQr}
                onChange={e => setShowQr(e.target.checked)}
                className="rounded border-neutral-300 text-emerald-600 focus:ring-emerald-500"
              />
            </div>

            <div className="flex items-center justify-between">
              <label className="text-xs text-neutral-700 dark:text-neutral-300">
                Include HSN/SAC Code on Items
              </label>
              <input
                type="checkbox"
                checked={showHsn}
                onChange={e => setShowHsn(e.target.checked)}
                className="rounded border-neutral-300 text-emerald-600 focus:ring-emerald-500"
              />
            </div>
          </div>

          <div className="pt-2 border-t border-neutral-100 dark:border-neutral-800">
            <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
              Receipt Footer Disclaimer
            </label>
            <textarea
              rows={3}
              value={footerNote}
              onChange={e => setFooterNote(e.target.value)}
              className="mt-1 w-full rounded border border-neutral-300 p-2 text-xs dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
            />
          </div>

          <button
            onClick={handleSave}
            className="w-full rounded-lg bg-emerald-600 py-2 text-xs font-bold text-white hover:bg-emerald-700"
          >
            Save Template Defaults
          </button>
        </div>

        {/* Right: Live Preview Container */}
        <div className="lg:col-span-2 rounded-xl border border-neutral-200 bg-neutral-100 p-6 flex flex-col items-center justify-center dark:border-neutral-800 dark:bg-neutral-950">
          <div className="text-center mb-3">
            <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider">
              Live Paper Preview: {template.replace('_', ' ')}
            </span>
          </div>

          <div className={`bg-white text-neutral-900 p-6 shadow-md border border-neutral-300 font-mono text-xs ${
            template === 'THERMAL_58' ? 'w-[280px]' : template === 'THERMAL_80' ? 'w-[360px]' : 'w-full max-w-xl'
          }`}>
            <div className="text-center pb-3 border-b border-dashed border-neutral-300">
              <h2 className="text-base font-bold font-sans">YB RETAIL STORE</h2>
              <p className="text-[11px] text-neutral-600">{currentBranch.name}</p>
              <p className="text-[10px] text-neutral-500">{currentBranch.address}, {currentBranch.city}</p>
              <p className="text-[10px] text-neutral-500">Ph: {currentBranch.phone}</p>
              <p className="text-[10px] font-semibold text-neutral-700 mt-1">GSTIN: {currentBranch.gstin}</p>
              <p className="text-[11px] font-bold mt-1 text-emerald-800 uppercase tracking-wider">TAX INVOICE</p>
            </div>

            <div className="py-2.5 border-b border-dashed border-neutral-300 text-[11px] space-y-1">
              <div className="flex justify-between">
                <span>Bill: INV-2026-09821</span>
                <span>Date: 03 Oct 2026</span>
              </div>
              <div className="flex justify-between">
                <span>Customer: Rajesh Sharma</span>
                <span>Cashier: Rohan Sharma</span>
              </div>
            </div>

            <div className="py-3 border-b border-dashed border-neutral-300">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="border-b border-neutral-300 pb-1 text-left text-neutral-500">
                    <th className="font-semibold py-1">Item</th>
                    <th className="font-semibold text-center">Qty</th>
                    <th className="font-semibold text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  <tr className="py-1">
                    <td className="py-1">
                      <p className="font-bold">Coca Cola 750ml</p>
                      {showHsn && <p className="text-[9px] text-neutral-500 font-sans">HSN 220210 · GST 28%</p>}
                    </td>
                    <td className="text-center font-tabular">2</td>
                    <td className="text-right font-bold font-tabular">₹80.00</td>
                  </tr>
                  <tr className="py-1">
                    <td className="py-1">
                      <p className="font-bold">Aashirvaad Atta 5kg</p>
                      {showHsn && <p className="text-[9px] text-neutral-500 font-sans">HSN 110100 · GST 5%</p>}
                    </td>
                    <td className="text-center font-tabular">1</td>
                    <td className="text-right font-bold font-tabular">₹265.00</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="py-2.5 border-b border-dashed border-neutral-300 text-[11px] space-y-1">
              <div className="flex justify-between">
                <span>Subtotal:</span>
                <span className="font-tabular font-semibold">₹345.00</span>
              </div>
              <div className="flex justify-between text-neutral-500 text-[10px]">
                <span>CGST: ₹16.40 | SGST: ₹16.40</span>
                <span className="font-tabular">₹32.80</span>
              </div>
              <div className="flex justify-between text-sm font-bold pt-1 border-t border-neutral-300">
                <span>GRAND TOTAL:</span>
                <span className="font-tabular">₹345.00</span>
              </div>
            </div>

            {showQr && (
              <div className="py-3 text-center border-b border-dashed border-neutral-300 flex flex-col items-center">
                <QrCode className="h-16 w-16 text-neutral-900" />
                <span className="text-[9px] font-sans text-neutral-500 mt-1">Scan with GPay/PhonePe to Pay</span>
              </div>
            )}

            <div className="pt-3 text-center text-[10px] text-neutral-500 font-sans space-y-1">
              <p>{footerNote}</p>
              <p className="font-mono text-[9px] text-neutral-400">Node: Pi-3B+ | SQLite-Local</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
