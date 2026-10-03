import React, { useState } from 'react';
import { Sale } from '../../types';
import { Printer, Download, Share2, PlusCircle, Check, X, FileText } from 'lucide-react';
import { useApp } from '../../context/AppContext';

interface ReceiptModalProps {
  sale: Sale;
  isOpen: boolean;
  onClose: () => void;
  onNewSale: () => void;
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({ sale, isOpen, onClose, onNewSale }) => {
  const { currentBranch, showToast } = useApp();
  const [format, setFormat] = useState<'THERMAL' | 'A4'>('THERMAL');
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handlePrint = () => {
    window.print();
  };

  const handleShare = () => {
    const summary = `YB INVENTORY & POS\nInvoice: ${sale.billNumber}\nTotal: ₹${sale.grandTotal.toFixed(2)}\nPayment: ${sale.paymentMethod}\nThank you!`;
    navigator.clipboard.writeText(summary);
    setCopied(true);
    showToast('Receipt text copied to clipboard', 'info');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div className="flex flex-col max-h-[90vh] w-full max-w-lg rounded-xl border border-neutral-200 bg-white shadow-2xl dark:border-neutral-800 dark:bg-neutral-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-3 dark:border-neutral-800">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
              <Check className="h-3.5 w-3.5" />
            </span>
            <span className="font-bold text-sm text-neutral-900 dark:text-white">Payment Successful</span>
          </div>

          <div className="flex items-center gap-2">
            {/* Format toggle */}
            <div className="flex rounded-md bg-neutral-100 p-0.5 text-xs font-medium dark:bg-neutral-800">
              <button
                onClick={() => setFormat('THERMAL')}
                className={`rounded px-2.5 py-1 transition-colors ${format === 'THERMAL' ? 'bg-white shadow-xs text-neutral-950 dark:bg-neutral-700 dark:text-white' : 'text-neutral-500'}`}
              >
                Thermal (80mm)
              </button>
              <button
                onClick={() => setFormat('A4')}
                className={`rounded px-2.5 py-1 transition-colors ${format === 'A4' ? 'bg-white shadow-xs text-neutral-950 dark:bg-neutral-700 dark:text-white' : 'text-neutral-500'}`}
              >
                A4 Tax Invoice
              </button>
            </div>

            <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700 p-1">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Printable Receipt Paper Container */}
        <div className="flex-1 overflow-y-auto p-4 bg-neutral-100 dark:bg-neutral-950/50 flex justify-center">
          <div 
            id="printable-receipt"
            className={`bg-white text-neutral-900 p-5 shadow-sm font-mono text-xs border border-neutral-200 ${
              format === 'THERMAL' ? 'w-[360px]' : 'w-full max-w-md'
            }`}
          >
            {/* Store Header */}
            <div className="text-center pb-3 border-b border-dashed border-neutral-300">
              <h2 className="text-base font-bold tracking-tight font-sans">YB RETAIL STORE</h2>
              <p className="text-[11px] text-neutral-600">{currentBranch.name}</p>
              <p className="text-[10px] text-neutral-500">{currentBranch.address}, {currentBranch.city}</p>
              <p className="text-[10px] text-neutral-500">Ph: {currentBranch.phone}</p>
              <p className="text-[10px] font-semibold text-neutral-700 mt-1">GSTIN: {currentBranch.gstin}</p>
              <p className="text-[11px] font-bold mt-1 text-emerald-800 uppercase tracking-wider">TAX INVOICE</p>
            </div>

            {/* Bill Details */}
            <div className="py-2.5 border-b border-dashed border-neutral-300 text-[11px] space-y-1">
              <div className="flex justify-between">
                <span>Bill No: <strong>{sale.billNumber}</strong></span>
                <span>Date: {sale.timestamp}</span>
              </div>
              <div className="flex justify-between">
                <span>Customer: {sale.customerName}</span>
                <span>Cashier: {sale.cashierName}</span>
              </div>
              {sale.customerPhone && (
                <div className="flex justify-between text-neutral-500 text-[10px]">
                  <span>Phone: {sale.customerPhone}</span>
                </div>
              )}
            </div>

            {/* Item Table */}
            <div className="py-3 border-b border-dashed border-neutral-300">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="border-b border-neutral-300 pb-1 text-left text-neutral-500">
                    <th className="font-semibold py-1">Item</th>
                    <th className="font-semibold text-center">Qty</th>
                    <th className="font-semibold text-right">Rate</th>
                    <th className="font-semibold text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {sale.items.map((item, idx) => (
                    <tr key={idx} className="py-1">
                      <td className="py-1">
                        <p className="font-semibold text-neutral-900 leading-tight">{item.product.name}</p>
                        <p className="text-[9px] text-neutral-500 font-sans">HSN: {item.product.hsn} · GST: {item.gstRate}%</p>
                      </td>
                      <td className="text-center font-tabular">{item.quantity}</td>
                      <td className="text-right font-tabular">₹{item.unitPrice.toFixed(2)}</td>
                      <td className="text-right font-bold font-tabular">₹{item.total.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totals & Tax Breakdown */}
            <div className="py-2.5 border-b border-dashed border-neutral-300 text-[11px] space-y-1">
              <div className="flex justify-between">
                <span>Subtotal ({sale.items.reduce((acc, i) => acc + i.quantity, 0)} Items):</span>
                <span className="font-tabular font-semibold">₹{sale.subtotal.toFixed(2)}</span>
              </div>
              {sale.totalDiscount > 0 && (
                <div className="flex justify-between text-emerald-700">
                  <span>Total Discount:</span>
                  <span className="font-tabular">-₹{sale.totalDiscount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between text-neutral-600 text-[10px]">
                <span>CGST:</span>
                <span className="font-tabular">₹{sale.cgst.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-neutral-600 text-[10px]">
                <span>SGST:</span>
                <span className="font-tabular">₹{sale.sgst.toFixed(2)}</span>
              </div>
              {sale.roundOff !== 0 && (
                <div className="flex justify-between text-neutral-500 text-[10px]">
                  <span>Round Off:</span>
                  <span className="font-tabular">{sale.roundOff > 0 ? `+₹${sale.roundOff.toFixed(2)}` : `-₹${Math.abs(sale.roundOff).toFixed(2)}`}</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-bold pt-1 border-t border-neutral-300">
                <span>GRAND TOTAL:</span>
                <span className="font-tabular">₹{sale.grandTotal.toFixed(2)}</span>
              </div>
            </div>

            {/* Payment Details */}
            <div className="py-2 border-b border-dashed border-neutral-300 text-[11px] space-y-0.5">
              <div className="flex justify-between">
                <span>Payment Mode:</span>
                <span className="font-bold">{sale.paymentMethod}</span>
              </div>
              <div className="flex justify-between">
                <span>Amount Paid:</span>
                <span className="font-tabular">₹{sale.amountReceived.toFixed(2)}</span>
              </div>
              {sale.changeDue > 0 && (
                <div className="flex justify-between font-bold text-emerald-800">
                  <span>Change Returned:</span>
                  <span className="font-tabular">₹{sale.changeDue.toFixed(2)}</span>
                </div>
              )}
            </div>

            {/* Receipt Footer */}
            <div className="pt-3 text-center text-[10px] text-neutral-500 font-sans space-y-1">
              <p>Thank you for shopping with us!</p>
              <p className="text-[9px]">Goods once sold can be exchanged within 7 days with bill.</p>
              <p className="font-mono text-[9px] text-neutral-400">Node: Pi-3B+ | SQLite-Local | Synced</p>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="border-t border-neutral-100 p-4 bg-white dark:border-neutral-800 dark:bg-neutral-900 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 rounded-lg bg-neutral-900 px-4 py-2 text-xs font-semibold text-white hover:bg-neutral-800 transition-colors dark:bg-white dark:text-neutral-950"
            >
              <Printer className="h-4 w-4" />
              <span>Print Receipt</span>
            </button>
            <button
              onClick={handleShare}
              className="flex items-center gap-1.5 rounded-lg border border-neutral-200 px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-200"
            >
              {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Share2 className="h-4 w-4" />}
              <span>{copied ? 'Copied' : 'Share'}</span>
            </button>
          </div>

          <button
            onClick={onNewSale}
            className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 transition-colors"
          >
            <PlusCircle className="h-4 w-4" />
            <span>New Sale (F1)</span>
          </button>
        </div>
      </div>
    </div>
  );
};
