import React, { useState, useEffect } from 'react';
import { Product } from '../types';
import { productsService } from '../services/products';
import { useApp } from '../context/AppContext';
import { 
  DollarSign, 
  Search, 
  Check, 
  Edit, 
  ArrowUpDown, 
  TrendingUp,
  Save
} from 'lucide-react';

export const PricingPage: React.FC = () => {
  const { showToast } = useApp();
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRetail, setEditRetail] = useState('');
  const [editWholesale, setEditWholesale] = useState('');

  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    const res = await productsService.getAll();
    setProducts(res.data);
  };

  const handleStartEdit = (p: Product) => {
    setEditingId(p.id);
    setEditRetail(p.sellingPrice.toString());
    setEditWholesale(p.wholesalePrice?.toString() || p.sellingPrice.toString());
  };

  const handleSavePrice = async (p: Product) => {
    const newRetail = parseFloat(editRetail) || p.sellingPrice;
    const newWholesale = parseFloat(editWholesale) || p.sellingPrice;

    await productsService.update(p.id, {
      sellingPrice: newRetail,
      wholesalePrice: newWholesale,
    });

    showToast(`Prices updated for ${p.name}`, 'success');
    setEditingId(null);
    loadProducts();
  };

  const filtered = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.sku.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white">
          Pricing Tiers &amp; Rate Slabs
        </h1>
        <p className="text-xs text-neutral-500">
          Set multi-tiered pricing: Retail counter prices, B2B wholesale rates, and maximum retail prices (MRP)
        </p>
      </div>

      {/* Search Bar */}
      <div className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-neutral-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search products to adjust pricing slabs..."
            className="w-full rounded-lg border border-neutral-200 bg-neutral-50 pl-9 pr-3 py-1.5 text-xs focus:bg-white focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
          />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-[11px] font-semibold text-neutral-500 dark:border-neutral-800 dark:bg-neutral-800/50">
            <tr>
              <th className="py-3 px-4">Item Name</th>
              <th className="py-3 px-4">SKU Code</th>
              <th className="py-3 px-4 text-right">Cost Price</th>
              <th className="py-3 px-4 text-right">Printed MRP</th>
              <th className="py-3 px-4 text-right">Retail Sell Price (₹)</th>
              <th className="py-3 px-4 text-right">Wholesale Rate (₹)</th>
              <th className="py-3 px-4 text-center">Retail Margin</th>
              <th className="py-3 px-4 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {filtered.map(p => {
              const isEditing = editingId === p.id;
              const marginPct = (((p.sellingPrice - p.purchasePrice) / (p.sellingPrice || 1)) * 100).toFixed(1);

              return (
                <tr key={p.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/40">
                  <td className="py-3 px-4 font-bold text-neutral-900 dark:text-white">
                    {p.name}
                  </td>
                  <td className="py-3 px-4 font-mono text-neutral-500 text-[11px]">
                    {p.sku}
                  </td>
                  <td className="py-3 px-4 text-right font-tabular text-neutral-500">
                    ₹{p.purchasePrice.toFixed(2)}
                  </td>
                  <td className="py-3 px-4 text-right font-tabular text-neutral-400 line-through">
                    ₹{p.mrp.toFixed(2)}
                  </td>

                  {/* Retail Price */}
                  <td className="py-3 px-4 text-right">
                    {isEditing ? (
                      <input
                        type="number"
                        step="0.5"
                        value={editRetail}
                        onChange={e => setEditRetail(e.target.value)}
                        className="w-20 rounded border border-neutral-300 p-1 text-right font-bold font-tabular text-xs dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                      />
                    ) : (
                      <span className="font-bold font-tabular text-neutral-900 dark:text-white">
                        ₹{p.sellingPrice.toFixed(2)}
                      </span>
                    )}
                  </td>

                  {/* Wholesale Price */}
                  <td className="py-3 px-4 text-right">
                    {isEditing ? (
                      <input
                        type="number"
                        step="0.5"
                        value={editWholesale}
                        onChange={e => setEditWholesale(e.target.value)}
                        className="w-20 rounded border border-neutral-300 p-1 text-right font-bold font-tabular text-xs dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                      />
                    ) : (
                      <span className="font-tabular text-neutral-600 dark:text-neutral-400">
                        ₹{(p.wholesalePrice || p.sellingPrice).toFixed(2)}
                      </span>
                    )}
                  </td>

                  <td className="py-3 px-4 text-center font-mono font-semibold text-emerald-600">
                    +{marginPct}%
                  </td>

                  <td className="py-3 px-4 text-right">
                    {isEditing ? (
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => handleSavePrice(p)}
                          className="rounded bg-emerald-600 p-1 text-white hover:bg-emerald-700"
                          title="Save Price"
                        >
                          <Save className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="rounded border p-1 text-neutral-500 hover:bg-neutral-100"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleStartEdit(p)}
                        className="rounded border border-neutral-300 px-2 py-1 text-xs font-semibold text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-200"
                      >
                        Edit Price
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
