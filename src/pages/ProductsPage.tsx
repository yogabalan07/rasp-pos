import React, { useState, useEffect, useCallback } from 'react';
import { Product, Category } from '../types';
import { productsService } from '../services/products';
import { inventoryService } from '../services/inventory';
import { ApiError } from '../services/api';
import { useApp } from '../context/AppContext';
import { 
  Search, 
  Plus, 
  Edit, 
  Trash2, 
  Copy, 
  Barcode, 
  Package, 
  Filter, 
  Check, 
  X,
  AlertCircle,
  Loader2,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

const PAGE_SIZE = 25;

export const ProductsPage: React.FC = () => {
  const { showToast } = useApp();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [subcategories, setSubcategories] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedCat, setSelectedCat] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // Form states
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [barcode, setBarcode] = useState('');
  const [brand, setBrand] = useState('');
  const [categoryId, setCategoryId] = useState('cat-bev');
  const [subcategory, setSubcategory] = useState('');
  const [unit, setUnit] = useState('Piece');
  const [hsn, setHsn] = useState('');
  const [gstRate, setGstRate] = useState(18);
  const [purchasePrice, setPurchasePrice] = useState('0');
  const [sellingPrice, setSellingPrice] = useState('0');
  const [mrp, setMrp] = useState('0');
  const [wholesalePrice, setWholesalePrice] = useState('0');
  const [stock, setStock] = useState('10');
  const [minStock, setMinStock] = useState('5');
  const [batchTracked, setBatchTracked] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    productsService.getCategories().then(r => setCategories(r.data)).catch(() => undefined);
    productsService.getSubcategories().then(r => setSubcategories(r.data)).catch(() => undefined);
  }, []);

  // Server-side search: debounce keystrokes, then hit the API.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, selectedCat, statusFilter]);

  const loadProducts = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const res = await productsService.listPage({
        q: debouncedSearch || undefined,
        category: selectedCat === 'ALL' ? undefined : selectedCat,
        isActive: statusFilter === 'ALL' ? undefined : statusFilter === 'ACTIVE',
        page,
        pageSize: PAGE_SIZE,
      });
      setProducts(res.data.items);
      setTotal(res.data.total);
      setPages(res.data.pages);
    } catch (err) {
      setProducts([]);
      setTotal(0);
      setLoadError(err instanceof ApiError ? err.message : 'Could not load products');
    } finally {
      setIsLoading(false);
    }
  }, [debouncedSearch, selectedCat, statusFilter, page]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const handleOpenCreate = () => {
    setEditingProduct(null);
    setName('');
    setSku(`SKU-${Date.now().toString().slice(-6)}`);
    setBarcode(`890${Math.floor(1000000000 + Math.random() * 9000000000)}`);
    setBrand('');
    setCategoryId(categories[1]?.id || 'cat-bev');
    setSubcategory('');
    setUnit('Piece');
    setHsn('210690');
    setGstRate(18);
    setPurchasePrice('0');
    setSellingPrice('0');
    setMrp('0');
    setWholesalePrice('0');
    setStock('25');
    setMinStock('10');
    setBatchTracked(false);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (p: Product) => {
    setEditingProduct(p);
    setName(p.name);
    setSku(p.sku);
    setBarcode(p.barcode);
    setBrand(p.brand);
    setCategoryId(p.categoryId);
    setSubcategory(p.subcategory || '');
    setUnit(p.unit);
    setHsn(p.hsn);
    setGstRate(p.gstRate);
    setPurchasePrice(p.purchasePrice.toString());
    setSellingPrice(p.sellingPrice.toString());
    setMrp(p.mrp.toString());
    setWholesalePrice(p.wholesalePrice?.toString() || p.sellingPrice.toString());
    setStock(p.stock.toString());
    setMinStock(p.minStock.toString());
    setBatchTracked(!!p.batchTracked);
    setIsModalOpen(true);
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      showToast('Product name is required', 'warning');
      return;
    }

    const catObj = categories.find(c => c.id === categoryId);
    const pPrice = parseFloat(purchasePrice) || 0;
    const sPrice = parseFloat(sellingPrice) || 0;
    const mPrice = parseFloat(mrp) || sPrice;
    const wPrice = parseFloat(wholesalePrice) || sPrice;
    const stk = parseInt(stock) || 0;
    const mStk = parseInt(minStock) || 5;

    const payload = {
      name: name.trim(),
      sku: sku.trim(),
      barcode: barcode.trim(),
      brand: brand.trim() || 'General',
      categoryId,
      categoryName: catObj?.name || 'General',
      subcategory: subcategory.trim(),
      unit,
      hsn: hsn.trim(),
      gstRate,
      purchasePrice: pPrice,
      sellingPrice: sPrice,
      mrp: mPrice,
      wholesalePrice: wPrice,
      stock: stk,
      minStock: mStk,
      status: (stk === 0 ? 'OUT_OF_STOCK' : stk <= mStk ? 'LOW_STOCK' : 'ACTIVE') as Product['status'],
      batchTracked,
    };

    setIsSaving(true);
    try {
      if (editingProduct) {
        await productsService.replace(editingProduct.id, payload);
        // Stock is owned by the inventory ledger: post one audited adjustment
        // when the form changed the quantity.
        const delta = stk - editingProduct.stock;
        if (delta !== 0) {
          await inventoryService.recordStockAdjustment(
            editingProduct.id,
            payload.name,
            payload.sku,
            delta,
            editingProduct.stock,
            'Stock corrected from the product form',
          );
        }
        showToast('Product updated successfully', 'success');
      } else {
        await productsService.create(payload);
        showToast('New product added to catalog', 'success');
      }
      setIsModalOpen(false);
      loadProducts();
    } catch (err) {
      showToast(
        err instanceof ApiError ? err.message : 'Could not save the product',
        'error',
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeactivate = async (p: Product) => {
    if (!confirm(`Deactivate ${p.name}? It will be hidden from the POS but kept in history.`)) {
      return;
    }
    try {
      await productsService.setStatus(p.id, false);
      showToast(`${p.name} deactivated`, 'info');
      loadProducts();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Could not deactivate', 'error');
    }
  };

  const handleActivate = async (p: Product) => {
    try {
      await productsService.setStatus(p.id, true);
      showToast(`${p.name} is active again`, 'success');
      loadProducts();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Could not activate', 'error');
    }
  };

  const handleDuplicate = async (p: Product) => {
    try {
      await productsService.create({
        ...p,
        name: `${p.name} (Copy)`,
        sku: `${p.sku}-CP`,
        barcode: `890${Math.floor(1000000000 + Math.random() * 9000000000)}`,
      });
      showToast(`Duplicated ${p.name}`, 'success');
      loadProducts();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Could not duplicate', 'error');
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white">
            Product Catalog &amp; Master
          </h1>
          <p className="text-xs text-neutral-500">
            Manage SKUs, barcodes, GST slabs, selling prices, and minimum stock alerts
          </p>
        </div>

        <button
          onClick={handleOpenCreate}
          className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 shadow-xs transition-colors"
        >
          <Plus className="h-4 w-4" />
          <span>Add Product</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-neutral-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by Product Name, SKU, Barcode, or Brand..."
            className="w-full rounded-lg border border-neutral-200 bg-neutral-50 pl-9 pr-3 py-1.5 text-xs focus:bg-white focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
          />
        </div>

        <div className="flex items-center gap-1.5 text-xs">
          <Filter className="h-3.5 w-3.5 text-neutral-400" />
          <select
            value={selectedCat}
            onChange={e => setSelectedCat(e.target.value)}
            className="rounded border border-neutral-200 bg-neutral-50 px-2.5 py-1 text-xs text-neutral-700 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
          >
            <option value="ALL">All Categories</option>
            {categories.filter(c => c.id !== 'cat-all').map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as typeof statusFilter)}
            className="rounded border border-neutral-200 bg-neutral-50 px-2.5 py-1 text-xs text-neutral-700 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
          >
            <option value="ALL">All Status</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </select>
        </div>
      </div>

      {loadError && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{loadError}</span>
          <button onClick={loadProducts} className="ml-auto font-semibold underline">
            Retry
          </button>
        </div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-[11px] font-semibold text-neutral-500 dark:border-neutral-800 dark:bg-neutral-800/50">
            <tr>
              <th className="py-3 px-4">Product Name</th>
              <th className="py-3 px-4">SKU / Barcode</th>
              <th className="py-3 px-4">Category</th>
              <th className="py-3 px-4 text-center">Stock</th>
              <th className="py-3 px-4 text-right">Cost Price</th>
              <th className="py-3 px-4 text-right">Selling Price</th>
              <th className="py-3 px-4 text-right">MRP</th>
              <th className="py-3 px-4 text-center">GST %</th>
              <th className="py-3 px-4 text-center">Status</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {isLoading && (
              <tr>
                <td colSpan={10} className="py-10 text-center text-neutral-400">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                  <p className="mt-2 text-xs">Loading products…</p>
                </td>
              </tr>
            )}

            {!isLoading && products.length === 0 && (
              <tr>
                <td colSpan={10} className="py-10 text-center text-neutral-400">
                  <Package className="mx-auto h-6 w-6" />
                  <p className="mt-2 text-xs">
                    {debouncedSearch || selectedCat !== 'ALL' || statusFilter !== 'ALL'
                      ? 'No products match the current filters.'
                      : 'No products yet. Add your first product to get started.'}
                  </p>
                </td>
              </tr>
            )}

            {!isLoading && products.map(p => (
              <tr key={p.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/40">
                <td className="py-3 px-4">
                  <p className="font-bold text-neutral-900 dark:text-white">{p.name}</p>
                  <p className="text-[10px] text-neutral-400">{p.brand} · HSN: {p.hsn}</p>
                </td>
                <td className="py-3 px-4 font-mono text-[11px] text-neutral-600 dark:text-neutral-400">
                  <p>{p.sku}</p>
                  <p className="text-[10px] text-neutral-400">{p.barcode}</p>
                </td>
                <td className="py-3 px-4 text-neutral-600 dark:text-neutral-400">
                  {p.categoryName}
                  {p.subcategory && (
                    <span className="block text-[10px] text-neutral-400">{p.subcategory}</span>
                  )}
                </td>
                <td className="py-3 px-4 text-center font-bold font-tabular">
                  <span className={`px-2 py-0.5 rounded text-[11px] ${
                    p.status === 'OUT_OF_STOCK'
                      ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300'
                      : p.status === 'LOW_STOCK'
                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                      : 'text-neutral-800 dark:text-neutral-200'
                  }`}>
                    {p.stock} {p.unit}
                  </span>
                </td>
                <td className="py-3 px-4 text-right font-tabular text-neutral-500">
                  ₹{p.purchasePrice.toFixed(2)}
                </td>
                <td className="py-3 px-4 text-right font-bold font-tabular text-neutral-900 dark:text-white">
                  ₹{p.sellingPrice.toFixed(2)}
                </td>
                <td className="py-3 px-4 text-right font-tabular text-neutral-400 line-through">
                  ₹{p.mrp.toFixed(2)}
                </td>
                <td className="py-3 px-4 text-center font-mono font-semibold">
                  {p.gstRate}%
                </td>
                <td className="py-3 px-4 text-center">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                    p.status === 'ACTIVE'
                      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                      : p.status === 'LOW_STOCK'
                      ? 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                      : p.status === 'INACTIVE'
                      ? 'bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400'
                      : 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300'
                  }`}>
                    {p.status.replace('_', ' ')}
                  </span>
                </td>
                <td className="py-3 px-4 text-right space-x-1 whitespace-nowrap">
                  <button
                    onClick={() => handleOpenEdit(p)}
                    className="p-1 rounded text-neutral-500 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800"
                    title="Edit Product"
                  >
                    <Edit className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => handleDuplicate(p)}
                    className="p-1 rounded text-neutral-500 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800"
                    title="Duplicate"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                  {p.status === 'INACTIVE' ? (
                    <button
                      onClick={() => handleActivate(p)}
                      className="p-1 rounded text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950"
                      title="Activate Product"
                    >
                      <Check className="h-3.5 w-3.5" />
                    </button>
                  ) : (
                    <button
                      onClick={() => handleDeactivate(p)}
                      className="p-1 rounded text-neutral-400 hover:text-red-600 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                      title="Deactivate Product"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Server-side pagination */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-neutral-200 bg-neutral-50 px-4 py-2 text-[11px] text-neutral-500 dark:border-neutral-800 dark:bg-neutral-800/50">
          <span>
            {total} product{total === 1 ? '' : 's'} · Page {page} of {Math.max(pages, 1)}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1 || isLoading}
              className="rounded border border-neutral-200 bg-white p-1 disabled:opacity-40 dark:border-neutral-700 dark:bg-neutral-900"
              title="Previous page"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setPage(p => Math.min(pages, p + 1))}
              disabled={page >= pages || isLoading}
              className="rounded border border-neutral-200 bg-white p-1 disabled:opacity-40 dark:border-neutral-700 dark:bg-neutral-900"
              title="Next page"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Create / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="flex flex-col w-full max-w-2xl rounded-xl border border-neutral-200 bg-white shadow-2xl dark:border-neutral-800 dark:bg-neutral-900 max-h-[90vh]">
            <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-3.5 dark:border-neutral-800">
              <h2 className="text-base font-bold text-neutral-900 dark:text-white">
                {editingProduct ? 'Edit Product' : 'Add New Product'}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-neutral-400 hover:text-neutral-700 p-1">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveProduct} className="flex-1 overflow-y-auto p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                    Product Title *
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="e.g. Aashirvaad Shudh Chakki Atta 5kg"
                    className="mt-1 w-full rounded-md border border-neutral-300 p-2 text-xs bg-white dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                    Brand Name
                  </label>
                  <input
                    type="text"
                    value={brand}
                    onChange={e => setBrand(e.target.value)}
                    placeholder="e.g. ITC / Aashirvaad"
                    className="mt-1 w-full rounded-md border border-neutral-300 p-2 text-xs bg-white dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                    Category
                  </label>
                  <select
                    value={categoryId}
                    onChange={e => setCategoryId(e.target.value)}
                    className="mt-1 w-full rounded-md border border-neutral-300 p-2 text-xs bg-white dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                  >
                    {categories.filter(c => c.id !== 'cat-all').map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                    Subcategory
                  </label>
                  <input
                    type="text"
                    list="subcategory-options"
                    value={subcategory}
                    onChange={e => setSubcategory(e.target.value)}
                    placeholder="e.g. Biscuits / Dairy / Instant Coffee"
                    className="mt-1 w-full rounded-md border border-neutral-300 p-2 text-xs bg-white dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                  />
                  <datalist id="subcategory-options">
                    {subcategories.map(s => (
                      <option key={s} value={s} />
                    ))}
                  </datalist>
                </div>

                <div>
                  <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                    SKU Code
                  </label>
                  <input
                    type="text"
                    value={sku}
                    onChange={e => setSku(e.target.value)}
                    className="mt-1 w-full rounded-md border border-neutral-300 p-2 text-xs font-mono bg-white dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                    Barcode (EAN-13 / UPC)
                  </label>
                  <input
                    type="text"
                    value={barcode}
                    onChange={e => setBarcode(e.target.value)}
                    className="mt-1 w-full rounded-md border border-neutral-300 p-2 text-xs font-mono bg-white dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                    HSN / SAC Code
                  </label>
                  <input
                    type="text"
                    value={hsn}
                    onChange={e => setHsn(e.target.value)}
                    placeholder="e.g. 190531"
                    className="mt-1 w-full rounded-md border border-neutral-300 p-2 text-xs font-mono bg-white dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                    GST Rate
                  </label>
                  <select
                    value={gstRate}
                    onChange={e => setGstRate(parseInt(e.target.value))}
                    className="mt-1 w-full rounded-md border border-neutral-300 p-2 text-xs bg-white dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                  >
                    <option value={0}>0% (Exempt)</option>
                    <option value={5}>5% (Staples / Packaged Food)</option>
                    <option value={12}>12% (Confectionery / Dairy)</option>
                    <option value={18}>18% (Standard FMCG / Snacks)</option>
                    <option value={28}>28% (Aerated Drinks / Luxury)</option>
                  </select>
                </div>
              </div>

              {/* Pricing section */}
              <div className="border-t border-neutral-100 pt-3 dark:border-neutral-800">
                <h3 className="text-xs font-bold text-neutral-900 dark:text-white mb-2">Price &amp; Stock Levels</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div>
                    <label className="text-[11px] font-semibold text-neutral-600 dark:text-neutral-400">Purchase Cost (₹)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={purchasePrice}
                      onChange={e => setPurchasePrice(e.target.value)}
                      className="mt-1 w-full rounded border border-neutral-300 p-1.5 text-xs font-tabular dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-neutral-600 dark:text-neutral-400">Retail Sell Price (₹) *</label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={sellingPrice}
                      onChange={e => setSellingPrice(e.target.value)}
                      className="mt-1 w-full rounded border border-neutral-300 p-1.5 text-xs font-tabular font-bold dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-neutral-600 dark:text-neutral-400">MRP Printed (₹)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={mrp}
                      onChange={e => setMrp(e.target.value)}
                      className="mt-1 w-full rounded border border-neutral-300 p-1.5 text-xs font-tabular dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-neutral-600 dark:text-neutral-400">Wholesale Price (₹)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={wholesalePrice}
                      onChange={e => setWholesalePrice(e.target.value)}
                      className="mt-1 w-full rounded border border-neutral-300 p-1.5 text-xs font-tabular dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 mt-3">
                  <div>
                    <label className="text-[11px] font-semibold text-neutral-600 dark:text-neutral-400">Current Stock Quantity</label>
                    <input
                      type="number"
                      value={stock}
                      onChange={e => setStock(e.target.value)}
                      className="mt-1 w-full rounded border border-neutral-300 p-1.5 text-xs font-tabular dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-neutral-600 dark:text-neutral-400">Min Alert Stock Threshold</label>
                    <input
                      type="number"
                      value={minStock}
                      onChange={e => setMinStock(e.target.value)}
                      className="mt-1 w-full rounded border border-neutral-300 p-1.5 text-xs font-tabular dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                    />
                  </div>
                </div>
              </div>

              {/* Batch FEFO tracking */}
              <div className="flex items-center gap-2 pt-2 border-t border-neutral-100 dark:border-neutral-800">
                <input
                  type="checkbox"
                  id="batchCheck"
                  checked={batchTracked}
                  onChange={e => setBatchTracked(e.target.checked)}
                  className="rounded border-neutral-300 text-emerald-600 focus:ring-emerald-500"
                />
                <label htmlFor="batchCheck" className="text-xs text-neutral-700 dark:text-neutral-300">
                  Enable Batch &amp; Expiry tracking (FEFO rotation)
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-neutral-100 dark:border-neutral-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-lg border border-neutral-300 px-4 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="rounded-lg bg-emerald-600 px-5 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-60"
                >
                  {isSaving ? 'Saving…' : 'Save Product'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
