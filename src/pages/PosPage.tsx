import React, { useState, useEffect, useRef } from 'react';
import { 
  Product, 
  CartItem, 
  Customer, 
  Sale, 
  PaymentMethod 
} from '../types';
import { productsService } from '../services/products';
import { salesService } from '../services/sales';
import { customersService } from '../services/customers';
import { useApp } from '../context/AppContext';
import { PaymentModal } from '../components/pos/PaymentModal';
import { ReceiptModal } from '../components/pos/ReceiptModal';
import { HeldBillsModal } from '../components/pos/HeldBillsModal';
import { CustomerSelectModal } from '../components/pos/CustomerSelectModal';
import { 
  Search, 
  Barcode, 
  Plus, 
  Minus, 
  Trash2, 
  User, 
  Clock, 
  RotateCcw, 
  Receipt, 
  CreditCard, 
  Percent, 
  Check,
  ShoppingBag,
  Zap
} from 'lucide-react';

export const PosPage: React.FC = () => {
  const { currentBranch, currentUser, showToast, navigateTo } = useApp();

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [activeCategoryId, setActiveCategoryId] = useState<string>('cat-all');
  const [searchQuery, setSearchQuery] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customer, setCustomer] = useState<Customer>({
    id: 'cust-walkin',
    name: 'Walk-in Customer',
    phone: '9999999999',
    outstandingBalance: 0,
    creditLimit: 0,
    loyaltyPoints: 0,
    totalBills: 148,
    totalSpent: 48200,
  });
  const [allCustomers, setAllCustomers] = useState<Customer[]>([]);

  // Modals
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [isReceiptOpen, setIsReceiptOpen] = useState(false);
  const [isHeldOpen, setIsHeldOpen] = useState(false);
  const [isCustomerOpen, setIsCustomerOpen] = useState(false);
  const [lastSale, setLastSale] = useState<Sale | null>(null);
  const [heldBills, setHeldBills] = useState<any[]>([]);

  // Additional charges & bill discount
  const [billDiscountPercent, setBillDiscountPercent] = useState<number>(0);
  const [additionalCharges, setAdditionalCharges] = useState<number>(0);

  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadData();
    // Keyboard shortcuts
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F1') {
        e.preventDefault();
        handleResetCart();
      } else if (e.key === 'F2') {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.key === 'F3') {
        e.preventDefault();
        setIsCustomerOpen(true);
      } else if (e.key === 'F4') {
        e.preventDefault();
        handleHoldBill();
      } else if (e.key === 'F5') {
        e.preventDefault();
        setIsHeldOpen(true);
      } else if (e.key === 'F6') {
        e.preventDefault();
        if (cart.length > 0) setIsPaymentOpen(true);
      } else if (e.key === 'F7') {
        e.preventDefault();
        navigateTo('/bills');
      } else if (e.key === 'Escape') {
        setIsPaymentOpen(false);
        setIsReceiptOpen(false);
        setIsHeldOpen(false);
        setIsCustomerOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cart, customer]);

  const loadData = async () => {
    const [prodRes, catRes, custRes, heldRes] = await Promise.all([
      productsService.getAll(),
      productsService.getCategories(),
      customersService.getAll(),
      salesService.getHeldBills(),
    ]);
    setProducts(prodRes.data);
    setCategories(catRes.data);
    setAllCustomers(custRes.data);
    setHeldBills(heldRes.data);
  };

  // Add product to cart
  const addToCart = (product: Product) => {
    if (product.stock <= 0) {
      showToast(`${product.name} is out of stock!`, 'warning');
      return;
    }

    setCart(prev => {
      const existing = prev.find(item => item.product.id === product.id);
      if (existing) {
        if (existing.quantity >= product.stock) {
          showToast(`Cannot exceed available stock (${product.stock})`, 'warning');
          return prev;
        }
        return prev.map(item => {
          if (item.product.id === product.id) {
            const newQty = item.quantity + 1;
            const itemDiscount = (item.unitPrice * newQty * item.discountPercent) / 100;
            const gross = item.unitPrice * newQty - itemDiscount;
            const gstAmount = (gross * item.gstRate) / (100 + item.gstRate);
            return {
              ...item,
              quantity: newQty,
              discountAmount: itemDiscount,
              gstAmount,
              total: gross,
            };
          }
          return item;
        });
      }

      // New item
      const unitPrice = product.sellingPrice;
      const gstAmount = (unitPrice * product.gstRate) / (100 + product.gstRate);
      const newItem: CartItem = {
        product,
        quantity: 1,
        unitPrice,
        discountPercent: 0,
        discountAmount: 0,
        gstRate: product.gstRate,
        gstAmount,
        total: unitPrice,
      };
      return [newItem, ...prev];
    });
  };

  const updateQuantity = (productId: string, delta: number) => {
    setCart(prev => {
      return prev
        .map(item => {
          if (item.product.id === productId) {
            const newQty = item.quantity + delta;
            if (newQty <= 0) return null;
            if (newQty > item.product.stock) {
              showToast(`Only ${item.product.stock} available in stock`, 'warning');
              return item;
            }
            const itemDiscount = (item.unitPrice * newQty * item.discountPercent) / 100;
            const gross = item.unitPrice * newQty - itemDiscount;
            const gstAmount = (gross * item.gstRate) / (100 + item.gstRate);
            return {
              ...item,
              quantity: newQty,
              discountAmount: itemDiscount,
              gstAmount,
              total: gross,
            };
          }
          return item;
        })
        .filter(Boolean) as CartItem[];
    });
  };

  const updateItemDiscount = (productId: string, discountPercent: number) => {
    setCart(prev =>
      prev.map(item => {
        if (item.product.id === productId) {
          const discountAmount = (item.unitPrice * item.quantity * discountPercent) / 100;
          const gross = item.unitPrice * item.quantity - discountAmount;
          const gstAmount = (gross * item.gstRate) / (100 + item.gstRate);
          return {
            ...item,
            discountPercent,
            discountAmount,
            gstAmount,
            total: gross,
          };
        }
        return item;
      })
    );
  };

  const removeFromCart = (productId: string) => {
    setCart(prev => prev.filter(item => item.product.id !== productId));
  };

  const handleResetCart = () => {
    setCart([]);
    setBillDiscountPercent(0);
    setAdditionalCharges(0);
    setCustomer(allCustomers[0] || {
      id: 'cust-walkin',
      name: 'Walk-in Customer',
      phone: '9999999999',
      outstandingBalance: 0,
      creditLimit: 0,
      loyaltyPoints: 0,
      totalBills: 0,
      totalSpent: 0,
    });
    showToast('New bill started (Cart cleared)', 'info');
  };

  const handleHoldBill = async () => {
    if (cart.length === 0) {
      showToast('Cannot hold an empty bill', 'warning');
      return;
    }
    await salesService.holdBill(cart, customer.name, customer.id);
    const updatedHeld = await salesService.getHeldBills();
    setHeldBills(updatedHeld.data);
    setCart([]);
    showToast(`Bill for ${customer.name} placed on hold (F4)`, 'info');
  };

  const handleResumeBill = async (holdId: string) => {
    const res = await salesService.recallHeldBill(holdId);
    if (res.data) {
      setCart(res.data.items);
      const cust = allCustomers.find(c => c.id === res.data?.customerId);
      if (cust) setCustomer(cust);
      const updatedHeld = await salesService.getHeldBills();
      setHeldBills(updatedHeld.data);
      setIsHeldOpen(false);
      showToast(`Recalled held bill for ${res.data.customerName}`, 'success');
    }
  };

  const handleBarcodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    const matched = products.find(
      p => p.barcode === searchQuery.trim() || p.sku.toLowerCase() === searchQuery.trim().toLowerCase()
    );

    if (matched) {
      addToCart(matched);
      setSearchQuery('');
      showToast(`Scanned: ${matched.name}`, 'success');
    } else {
      // Filter or keep search open
    }
  };

  // Calculations
  const rawSubtotal = cart.reduce((acc, i) => acc + i.unitPrice * i.quantity, 0);
  const itemsDiscountTotal = cart.reduce((acc, i) => acc + i.discountAmount, 0);
  const billDiscountAmount = ((rawSubtotal - itemsDiscountTotal) * billDiscountPercent) / 100;
  const totalDiscount = itemsDiscountTotal + billDiscountAmount;
  const taxableSubtotal = rawSubtotal - totalDiscount;

  // Split GST: Intra-state 50% CGST, 50% SGST
  const totalTax = cart.reduce((acc, i) => acc + i.gstAmount, 0);
  const cgst = totalTax / 2;
  const sgst = totalTax / 2;
  const igst = 0;

  const rawGrandTotal = taxableSubtotal + additionalCharges;
  const roundedGrandTotal = Math.round(rawGrandTotal);
  const roundOff = roundedGrandTotal - rawGrandTotal;

  // Finalize payment
  const handleCompletePayment = async (details: {
    method: PaymentMethod;
    amountReceived: number;
    changeDue: number;
    notes?: string;
  }) => {
    try {
      const saleRes = await salesService.createSale({
        cashierId: currentUser.id,
        cashierName: currentUser.name,
        customerId: customer.id,
        customerName: customer.name,
        customerPhone: customer.phone,
        items: [...cart],
        subtotal: rawSubtotal,
        totalDiscount,
        cgst,
        sgst,
        igst,
        totalTax,
        additionalCharges,
        roundOff,
        grandTotal: roundedGrandTotal,
        paymentMethod: details.method,
        amountReceived: details.amountReceived,
        changeDue: details.changeDue,
        status: 'COMPLETED',
        branchId: currentBranch.id,
        notes: details.notes,
      });

      setLastSale(saleRes.data);
      setIsPaymentOpen(false);
      setIsReceiptOpen(true);
      showToast(`Sale completed: ${saleRes.data.billNumber}`, 'success');

      // Refresh products to update live stocks
      const updatedProds = await productsService.getAll();
      setProducts(updatedProds.data);
    } catch (err: any) {
      showToast(err.message || 'Payment failed', 'error');
    }
  };

  const filteredProducts = products.filter(p => {
    const matchesCat = activeCategoryId === 'cat-all' || p.categoryId === activeCategoryId;
    if (!matchesCat) return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      p.sku.toLowerCase().includes(q) ||
      p.barcode.includes(q) ||
      p.brand.toLowerCase().includes(q)
    );
  });

  return (
    <div className="flex h-[calc(100vh-3.5rem)] w-full overflow-hidden bg-neutral-100 dark:bg-neutral-950">
      {/* LEFT/CENTER: Product Catalog & Search (60%) */}
      <div className="flex flex-1 flex-col overflow-hidden border-r border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
        {/* Search Bar & Shortcuts Banner */}
        <div className="p-3 border-b border-neutral-200 dark:border-neutral-800 space-y-2">
          <form onSubmit={handleBarcodeSubmit} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-neutral-400" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search products by Name, SKU, or scan Barcode (Press F2)..."
                className="w-full rounded-lg border border-neutral-200 bg-neutral-50 pl-9 pr-8 py-2 text-xs focus:bg-white focus:border-neutral-900 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:focus:bg-neutral-900 dark:text-white"
              />
              <Barcode className="absolute right-2.5 top-2.5 h-4 w-4 text-neutral-400" />
            </div>

            {/* Quick Actions */}
            <button
              type="button"
              onClick={() => setIsHeldOpen(true)}
              className="relative flex items-center gap-1.5 rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
              title="Resume Held Bills (F5)"
            >
              <Clock className="h-3.5 w-3.5 text-amber-600" />
              <span className="hidden sm:inline">Held</span>
              {heldBills.length > 0 && (
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white">
                  {heldBills.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={handleResetCart}
              className="flex items-center gap-1 rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
              title="New Bill (F1)"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">New (F1)</span>
            </button>
          </form>

          {/* Category Filter Tabs */}
          <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar text-xs">
            {categories.map(cat => (
              <button
                key={cat.id}
                onClick={() => setActiveCategoryId(cat.id)}
                className={`whitespace-nowrap rounded-md px-3 py-1 font-medium transition-colors ${
                  activeCategoryId === cat.id
                    ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-950 font-semibold shadow-xs'
                    : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700'
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>
        </div>

        {/* Product Cards Grid */}
        <div className="flex-1 overflow-y-auto p-3">
          {filteredProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-neutral-400">
              <ShoppingBag className="h-10 w-10 text-neutral-300 stroke-1 mb-2" />
              <p className="text-xs font-medium">No matching products found.</p>
              <p className="text-[11px] text-neutral-400">Try searching with a different keyword or barcode.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2.5">
              {filteredProducts.map(product => {
                const isOutOfStock = product.stock <= 0;
                const isLowStock = product.stock <= product.minStock && product.stock > 0;

                return (
                  <button
                    key={product.id}
                    onClick={() => addToCart(product)}
                    disabled={isOutOfStock}
                    className={`group relative flex flex-col justify-between rounded-xl border text-left p-2.5 transition-all select-none hover:shadow-md ${
                      isOutOfStock
                        ? 'border-neutral-200 bg-neutral-50/60 opacity-60 dark:border-neutral-800 dark:bg-neutral-900 cursor-not-allowed'
                        : 'border-neutral-200 bg-white hover:border-neutral-400 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-700 active:scale-[0.98]'
                    }`}
                  >
                    {/* Image / Fallback Container */}
                    <div className="relative mb-2 aspect-4/3 w-full overflow-hidden rounded-lg bg-neutral-100 dark:bg-neutral-800">
                      {product.image ? (
                        <img
                          src={product.image}
                          alt={product.name}
                          className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-200"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-neutral-100 to-neutral-200 dark:from-neutral-800 dark:to-neutral-900 text-neutral-400">
                          <ShoppingBag className="h-8 w-8 stroke-1 text-neutral-400" />
                        </div>
                      )}

                      {/* Stock Badge */}
                      <span
                        className={`absolute top-1.5 right-1.5 rounded px-1.5 py-0.5 text-[9px] font-bold font-tabular shadow-xs ${
                          isOutOfStock
                            ? 'bg-red-600 text-white'
                            : isLowStock
                            ? 'bg-amber-500 text-neutral-950'
                            : 'bg-neutral-900/80 text-white backdrop-blur-xs'
                        }`}
                      >
                        {isOutOfStock ? 'OUT' : `Qty: ${product.stock}`}
                      </span>
                    </div>

                    {/* Content */}
                    <div className="flex flex-col flex-1 justify-between">
                      <div>
                        <span className="text-[10px] text-neutral-400 font-medium">{product.brand}</span>
                        <h4 className="line-clamp-2 text-xs font-bold text-neutral-900 dark:text-white leading-tight">
                          {product.name}
                        </h4>
                      </div>

                      <div className="mt-2 flex items-baseline justify-between border-t border-neutral-100 pt-1.5 dark:border-neutral-800">
                        <div className="flex items-baseline gap-1">
                          <span className="text-sm font-extrabold text-neutral-950 dark:text-white font-tabular">
                            ₹{product.sellingPrice.toFixed(0)}
                          </span>
                          {product.mrp > product.sellingPrice && (
                            <span className="text-[10px] text-neutral-400 line-through font-tabular">
                              ₹{product.mrp}
                            </span>
                          )}
                        </div>
                        <span className="text-[9px] text-neutral-400 font-mono">
                          {product.sku.split('-').slice(0, 2).join('-')}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Keyboard Helper Bar */}
        <div className="hidden sm:flex items-center justify-between border-t border-neutral-200 bg-neutral-50 px-3 py-1.5 text-[11px] text-neutral-500 dark:border-neutral-800 dark:bg-neutral-950">
          <div className="flex items-center gap-3">
            <span><kbd className="font-mono bg-white dark:bg-neutral-800 border px-1 rounded">F1</kbd> New</span>
            <span><kbd className="font-mono bg-white dark:bg-neutral-800 border px-1 rounded">F2</kbd> Search</span>
            <span><kbd className="font-mono bg-white dark:bg-neutral-800 border px-1 rounded">F3</kbd> Customer</span>
            <span><kbd className="font-mono bg-white dark:bg-neutral-800 border px-1 rounded">F4</kbd> Hold</span>
            <span><kbd className="font-mono bg-white dark:bg-neutral-800 border px-1 rounded">F5</kbd> Recall</span>
            <span><kbd className="font-mono bg-white dark:bg-neutral-800 border px-1 rounded">F6</kbd> Pay</span>
          </div>
          <span className="font-mono text-[10px] text-emerald-600 font-semibold">Ready for Barcode Scan</span>
        </div>
      </div>

      {/* RIGHT: Active Bill Cart Panel (40%) */}
      <div className="flex w-full max-w-sm sm:max-w-md lg:max-w-lg flex-col justify-between bg-white dark:bg-neutral-900 border-l border-neutral-200 dark:border-neutral-800 shadow-lg">
        {/* Customer Header */}
        <div className="flex items-center justify-between border-b border-neutral-200 p-3 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-800/40">
          <div 
            onClick={() => setIsCustomerOpen(true)}
            className="flex items-center gap-2 cursor-pointer rounded-lg p-1 hover:bg-neutral-200/50 dark:hover:bg-neutral-700/50"
            title="Click or press F3 to select customer"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-neutral-900 text-white dark:bg-white dark:text-neutral-950">
              <User className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-neutral-900 dark:text-white">{customer.name}</span>
                <span className="text-[10px] text-neutral-400 font-mono">(F3)</span>
              </div>
              <p className="text-[10px] text-neutral-500">{customer.phone}</p>
            </div>
          </div>

          {customer.outstandingBalance > 0 && (
            <div className="text-right">
              <span className="text-[10px] text-amber-700 font-medium">Khata Due</span>
              <p className="text-xs font-bold text-red-600 font-tabular">₹{customer.outstandingBalance.toFixed(2)}</p>
            </div>
          )}
        </div>

        {/* Cart Items List */}
        <div className="flex-1 overflow-y-auto divide-y divide-neutral-100 p-2 dark:divide-neutral-800">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-16 text-neutral-400 text-center">
              <Receipt className="h-10 w-10 text-neutral-300 stroke-1 mb-2" />
              <p className="text-xs font-semibold text-neutral-600 dark:text-neutral-300">Cart is empty</p>
              <p className="text-[11px] text-neutral-400 max-w-xs mt-1">
                Scan barcode, search by SKU, or click any product from the catalog to begin billing.
              </p>
            </div>
          ) : (
            cart.map(item => (
              <div key={item.product.id} className="py-2.5 px-2 hover:bg-neutral-50 dark:hover:bg-neutral-800/40 rounded-lg group">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-neutral-900 dark:text-white truncate">
                      {item.product.name}
                    </p>
                    <div className="flex items-center gap-2 text-[10px] text-neutral-400">
                      <span>Rate: ₹{item.unitPrice.toFixed(2)}</span>
                      <span>·</span>
                      <span>GST: {item.gstRate}%</span>
                      {item.discountPercent > 0 && (
                        <span className="text-emerald-600 font-bold">-{item.discountPercent}%</span>
                      )}
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-xs font-bold text-neutral-900 dark:text-white font-tabular">
                      ₹{item.total.toFixed(2)}
                    </span>
                    <button
                      onClick={() => removeFromCart(item.product.id)}
                      className="ml-2 text-neutral-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity p-0.5"
                      title="Remove item"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* Inline Qty Controls & Discount */}
                <div className="mt-2 flex items-center justify-between">
                  <div className="flex items-center rounded-md border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-800">
                    <button
                      onClick={() => updateQuantity(item.product.id, -1)}
                      className="p-1 hover:bg-neutral-100 text-neutral-600 dark:hover:bg-neutral-700 dark:text-neutral-300"
                    >
                      <Minus className="h-3 w-3" />
                    </button>
                    <span className="px-3 text-xs font-bold font-tabular text-neutral-900 dark:text-white">
                      {item.quantity}
                    </span>
                    <button
                      onClick={() => updateQuantity(item.product.id, 1)}
                      className="p-1 hover:bg-neutral-100 text-neutral-600 dark:hover:bg-neutral-700 dark:text-neutral-300"
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                  </div>

                  {/* Inline Item Discount button */}
                  <div className="flex items-center gap-1">
                    {[0, 5, 10].map(pct => (
                      <button
                        key={pct}
                        onClick={() => updateItemDiscount(item.product.id, pct)}
                        className={`rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
                          item.discountPercent === pct
                            ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-950 font-bold'
                            : 'border border-neutral-200 text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300'
                        }`}
                      >
                        {pct === 0 ? 'No Disc' : `${pct}%`}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Bill Summary Calculations */}
        <div className="border-t border-neutral-200 bg-neutral-50/50 p-3 space-y-1.5 text-xs dark:border-neutral-800 dark:bg-neutral-800/30">
          <div className="flex justify-between text-neutral-600 dark:text-neutral-400">
            <span>Subtotal ({cart.reduce((acc, i) => acc + i.quantity, 0)} items)</span>
            <span className="font-tabular">₹{rawSubtotal.toFixed(2)}</span>
          </div>

          {totalDiscount > 0 && (
            <div className="flex justify-between text-emerald-600 font-medium">
              <span>Total Discount</span>
              <span className="font-tabular">-₹{totalDiscount.toFixed(2)}</span>
            </div>
          )}

          <div className="flex justify-between text-neutral-500 text-[11px]">
            <span>Estimated GST (CGST ₹{cgst.toFixed(1)} + SGST ₹{sgst.toFixed(1)})</span>
            <span className="font-tabular">₹{totalTax.toFixed(2)}</span>
          </div>

          {roundOff !== 0 && (
            <div className="flex justify-between text-neutral-400 text-[11px]">
              <span>Round Off</span>
              <span className="font-tabular">{roundOff > 0 ? `+₹${roundOff.toFixed(2)}` : `-₹${Math.abs(roundOff).toFixed(2)}`}</span>
            </div>
          )}

          {/* Grand Total */}
          <div className="flex items-baseline justify-between border-t border-neutral-200 pt-2 text-base font-extrabold text-neutral-950 dark:border-neutral-700 dark:text-white">
            <span>TOTAL TO PAY</span>
            <span className="text-xl font-black font-tabular text-emerald-700 dark:text-emerald-400">
              ₹{roundedGrandTotal.toFixed(2)}
            </span>
          </div>
        </div>

        {/* Bottom Tender & Action Buttons */}
        <div className="p-3 border-t border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900 space-y-2">
          {/* Quick Payment Mode Shortcuts */}
          <div className="grid grid-cols-4 gap-1.5 text-xs">
            <button
              onClick={() => { if (cart.length > 0) setIsPaymentOpen(true); }}
              disabled={cart.length === 0}
              className="flex items-center justify-center gap-1 rounded-md border border-neutral-300 py-1.5 font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-40 dark:border-neutral-700 dark:text-neutral-200"
            >
              <span>CASH</span>
            </button>
            <button
              onClick={() => { if (cart.length > 0) setIsPaymentOpen(true); }}
              disabled={cart.length === 0}
              className="flex items-center justify-center gap-1 rounded-md border border-neutral-300 py-1.5 font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-40 dark:border-neutral-700 dark:text-neutral-200"
            >
              <span>UPI</span>
            </button>
            <button
              onClick={() => { if (cart.length > 0) setIsPaymentOpen(true); }}
              disabled={cart.length === 0}
              className="flex items-center justify-center gap-1 rounded-md border border-neutral-300 py-1.5 font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-40 dark:border-neutral-700 dark:text-neutral-200"
            >
              <span>CARD</span>
            </button>
            <button
              onClick={() => { if (cart.length > 0) setIsPaymentOpen(true); }}
              disabled={cart.length === 0}
              className="flex items-center justify-center gap-1 rounded-md border border-neutral-300 py-1.5 font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-40 dark:border-neutral-700 dark:text-neutral-200"
            >
              <span>KHATA</span>
            </button>
          </div>

          {/* Big Checkout Button */}
          <div className="flex gap-2">
            <button
              onClick={handleHoldBill}
              disabled={cart.length === 0}
              className="rounded-lg border border-neutral-300 px-3 py-2.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-100 disabled:opacity-40 dark:border-neutral-700 dark:text-neutral-300"
              title="Hold Bill (F4)"
            >
              Hold (F4)
            </button>

            <button
              onClick={() => setIsPaymentOpen(true)}
              disabled={cart.length === 0}
              className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-emerald-600 py-3 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-40 shadow-sm transition-colors"
            >
              <Zap className="h-4 w-4 fill-white" />
              <span>PAY ₹{roundedGrandTotal.toFixed(2)} (F6)</span>
            </button>
          </div>
        </div>
      </div>

      {/* Payment Tender Modal */}
      <PaymentModal
        isOpen={isPaymentOpen}
        totalAmount={roundedGrandTotal}
        customer={customer}
        onClose={() => setIsPaymentOpen(false)}
        onComplete={handleCompletePayment}
      />

      {/* Receipt Modal */}
      {lastSale && (
        <ReceiptModal
          isOpen={isReceiptOpen}
          sale={lastSale}
          onClose={() => setIsReceiptOpen(false)}
          onNewSale={() => {
            setIsReceiptOpen(false);
            handleResetCart();
          }}
        />
      )}

      {/* Held Bills Modal */}
      <HeldBillsModal
        isOpen={isHeldOpen}
        onClose={() => setIsHeldOpen(false)}
        heldBills={heldBills}
        onResume={handleResumeBill}
        onCancel={async id => {
          await salesService.cancelHeldBill(id);
          const updated = await salesService.getHeldBills();
          setHeldBills(updated.data);
          showToast('Held bill discarded', 'info');
        }}
      />

      {/* Customer Select Modal */}
      <CustomerSelectModal
        isOpen={isCustomerOpen}
        customers={allCustomers}
        selectedCustomerId={customer.id}
        onClose={() => setIsCustomerOpen(false)}
        onSelectCustomer={c => {
          setCustomer(c);
          showToast(`Customer attached: ${c.name}`, 'info');
        }}
        onCreateCustomer={async newCust => {
          const res = await customersService.create(newCust);
          setAllCustomers(prev => [...prev, res.data]);
          setCustomer(res.data);
          showToast(`Customer created and attached: ${res.data.name}`, 'success');
        }}
      />
    </div>
  );
};
