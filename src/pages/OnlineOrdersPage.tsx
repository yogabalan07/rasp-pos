import React, { useState } from 'react';
import { INITIAL_ONLINE_ORDERS } from '../data/mockData';
import { OnlineOrder } from '../types';
import { useApp } from '../context/AppContext';
import { 
  Globe, 
  ShoppingBag, 
  Clock, 
  MapPin, 
  Phone, 
  Check, 
  Truck, 
  ArrowRight 
} from 'lucide-react';

export const OnlineOrdersPage: React.FC = () => {
  const { showToast } = useApp();
  const [orders, setOrders] = useState<OnlineOrder[]>(INITIAL_ONLINE_ORDERS);

  const handleUpdateStatus = (id: string, newStatus: OnlineOrder['orderStatus']) => {
    setOrders(prev => prev.map(o => o.id === id ? { ...o, orderStatus: newStatus } : o));
    showToast(`Order status updated to ${newStatus}`, 'success');
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white">
          Online Orders &amp; Store Pickup
        </h1>
        <p className="text-xs text-neutral-500">
          Manage digital orders from online catalog with pickup queue and home delivery tracking
        </p>
      </div>

      {/* Orders Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {orders.map(ord => (
          <div
            key={ord.id}
            className="flex flex-col justify-between rounded-xl border border-neutral-200 bg-white p-5 shadow-xs dark:border-neutral-800 dark:bg-neutral-900"
          >
            <div>
              <div className="flex items-center justify-between border-b border-neutral-100 pb-3 dark:border-neutral-800">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-bold text-neutral-900 dark:text-white">{ord.orderNumber}</span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    ord.orderType === 'PICKUP' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'
                  }`}>
                    {ord.orderType}
                  </span>
                </div>

                <span className="font-mono text-xs text-neutral-400 font-semibold">{ord.placedAt}</span>
              </div>

              <div className="mt-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-neutral-900 dark:text-white">{ord.customerName}</span>
                  <span className="font-mono text-neutral-500">{ord.customerPhone}</span>
                </div>
                {ord.deliveryAddress && (
                  <p className="text-[11px] text-neutral-400 mt-1 flex items-start gap-1">
                    <MapPin className="h-3 w-3 shrink-0 mt-0.5 text-neutral-400" />
                    <span>{ord.deliveryAddress}</span>
                  </p>
                )}
              </div>

              {/* Items List */}
              <div className="mt-3 rounded-lg bg-neutral-50 p-3 dark:bg-neutral-800/40 text-xs space-y-1">
                {ord.items.map((item, idx) => (
                  <div key={idx} className="flex justify-between">
                    <span>{item.qty}x {item.name}</span>
                    <span className="font-tabular font-semibold">₹{(item.qty * item.price).toFixed(2)}</span>
                  </div>
                ))}
                <div className="border-t border-neutral-200 pt-1.5 mt-1.5 flex justify-between font-bold dark:border-neutral-700">
                  <span>Grand Total ({ord.paymentStatus.replace('_', ' ')}):</span>
                  <span className="font-tabular text-sm text-emerald-700 dark:text-emerald-400">
                    ₹{ord.total.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>

            {/* Status Workflow Controls */}
            <div className="mt-4 pt-3 border-t border-neutral-100 dark:border-neutral-800 flex items-center justify-between gap-2">
              <span className="text-xs font-bold font-mono text-neutral-500">
                Status: <strong className="text-neutral-900 dark:text-white">{ord.orderStatus}</strong>
              </span>

              <div className="flex gap-1.5">
                {ord.orderStatus === 'CONFIRMED' && (
                  <button
                    onClick={() => handleUpdateStatus(ord.id, 'PREPARING')}
                    className="rounded bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-neutral-800"
                  >
                    Start Packing
                  </button>
                )}
                {ord.orderStatus === 'PREPARING' && (
                  <button
                    onClick={() => handleUpdateStatus(ord.id, 'READY')}
                    className="rounded bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700"
                  >
                    Mark Ready for Pickup
                  </button>
                )}
                {ord.orderStatus === 'READY' && (
                  <button
                    onClick={() => handleUpdateStatus(ord.id, 'COMPLETED')}
                    className="rounded bg-neutral-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-neutral-800"
                  >
                    Handed to Customer
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
