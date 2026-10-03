import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { authService, SYSTEM_USERS } from '../services/auth';
import { 
  Server, 
  Cloud, 
  RefreshCw, 
  Lock, 
  KeyRound, 
  Mail, 
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  Delete
} from 'lucide-react';

export const AuthPages: React.FC = () => {
  const { systemStatus, navigateTo, showToast } = useApp();
  const [authMode, setAuthMode] = useState<'LOGIN' | 'PIN' | 'REGISTER' | 'FORGOT'>('LOGIN');

  // Login form
  const [email, setEmail] = useState('yogabalan2007yoga@gmail.com');
  const [password, setPassword] = useState('password123');

  // PIN form
  const [pin, setPin] = useState('');

  // Register form
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPhone, setRegPhone] = useState('');

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await authService.loginWithEmail(email, password);
      showToast('Logged in successfully', 'success');
      navigateTo('/pos');
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handlePinSubmit = async (enteredPin: string) => {
    try {
      await authService.loginWithPin(enteredPin);
      showToast('Cashier authenticated via PIN', 'success');
      navigateTo('/pos');
    } catch (err: any) {
      showToast(err.message, 'error');
      setPin('');
    }
  };

  const handlePinDigit = (digit: string) => {
    if (pin.length < 4) {
      const nextPin = pin + digit;
      setPin(nextPin);
      if (nextPin.length === 4) {
        handlePinSubmit(nextPin);
      }
    }
  };

  const handlePinBackspace = () => {
    setPin(prev => prev.slice(0, -1));
  };

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] flex-col items-center justify-center p-4 bg-neutral-100 dark:bg-neutral-950">
      <div className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-6 sm:p-8 shadow-xl dark:border-neutral-800 dark:bg-neutral-900 space-y-6">
        {/* Brand Lockup */}
        <div className="text-center space-y-1">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg bg-neutral-900 text-white font-black text-sm dark:bg-white dark:text-neutral-950 mb-2">
            YB
          </div>
          <h1 className="text-lg font-extrabold tracking-tight text-neutral-950 dark:text-white">
            YB INVENTORY &amp; POS
          </h1>
          <p className="text-xs text-neutral-500">
            Raspberry Pi Edge &amp; Cloud Retail Terminal
          </p>
        </div>

        {/* Live System Telemetry Status Pill */}
        <div className="rounded-xl border border-neutral-200 bg-neutral-50/70 p-2.5 text-xs text-neutral-600 dark:border-neutral-800 dark:bg-neutral-800/50 flex items-center justify-around font-medium">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <span>Local: <strong>Online</strong></span>
          </div>
          <span className="text-neutral-300 dark:text-neutral-700">|</span>
          <div className="flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${systemStatus.cloudServer === 'ONLINE' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
            <span>Cloud: <strong>{systemStatus.cloudServer === 'ONLINE' ? 'Connected' : 'Offline'}</strong></span>
          </div>
          <span className="text-neutral-300 dark:text-neutral-700">|</span>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <span>Sync: <strong>Synced</strong></span>
          </div>
        </div>

        {/* Auth Mode: Email Login */}
        {authMode === 'LOGIN' && (
          <form onSubmit={handleEmailLogin} className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                Username / Email
              </label>
              <div className="relative mt-1">
                <Mail className="absolute left-3 top-2.5 h-4 w-4 text-neutral-400" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-neutral-300 bg-white pl-9 pr-3 py-2 text-xs text-neutral-900 focus:border-neutral-900 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center text-xs">
                <label className="font-semibold text-neutral-700 dark:text-neutral-300">Password</label>
                <button
                  type="button"
                  onClick={() => setAuthMode('FORGOT')}
                  className="text-neutral-500 hover:text-neutral-900 dark:hover:text-white"
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative mt-1">
                <Lock className="absolute left-3 top-2.5 h-4 w-4 text-neutral-400" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-neutral-300 bg-white pl-9 pr-3 py-2 text-xs text-neutral-900 focus:border-neutral-900 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full rounded-lg bg-neutral-900 py-2.5 text-xs font-bold text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-950 transition-colors"
            >
              Sign In to Terminal
            </button>

            <div className="relative my-4 text-center">
              <span className="relative z-10 bg-white px-3 text-[11px] font-semibold text-neutral-400 dark:bg-neutral-900">
                OR QUICK LOGIN
              </span>
              <div className="absolute inset-0 top-1/2 -z-0 border-t border-neutral-200 dark:border-neutral-800" />
            </div>

            <button
              type="button"
              onClick={() => { setPin(''); setAuthMode('PIN'); }}
              className="w-full flex items-center justify-center gap-2 rounded-lg border border-neutral-300 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
            >
              <KeyRound className="h-4 w-4 text-neutral-500" />
              <span>Login with 4-Digit Cashier PIN</span>
            </button>
          </form>
        )}

        {/* Auth Mode: 4-Digit PIN Keypad */}
        {authMode === 'PIN' && (
          <div className="space-y-4">
            <div className="text-center">
              <h2 className="text-sm font-bold text-neutral-900 dark:text-white">Cashier PIN Authentication</h2>
              <p className="text-[11px] text-neutral-400 mt-0.5">Quick numeric keypad for touch terminals (Hint: 1234 or 9999)</p>

              {/* PIN Dots */}
              <div className="my-4 flex justify-center gap-3">
                {[0, 1, 2, 3].map(idx => (
                  <div
                    key={idx}
                    className={`h-3 w-3 rounded-full border border-neutral-400 transition-all ${
                      pin.length > idx ? 'bg-neutral-900 dark:bg-white' : 'bg-transparent'
                    }`}
                  />
                ))}
              </div>
            </div>

            {/* Keypad Grid */}
            <div className="grid grid-cols-3 gap-2 max-w-[240px] mx-auto">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'].map(btn => (
                <button
                  key={btn}
                  type="button"
                  onClick={() => {
                    if (btn === 'C') setPin('');
                    else if (btn === '⌫') handlePinBackspace();
                    else handlePinDigit(btn);
                  }}
                  className="flex h-12 items-center justify-center rounded-xl border border-neutral-200 bg-neutral-50 text-base font-bold text-neutral-900 hover:bg-neutral-100 active:scale-95 transition-all dark:border-neutral-700 dark:bg-neutral-800 dark:text-white font-tabular"
                >
                  {btn}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setAuthMode('LOGIN')}
              className="w-full text-center text-xs font-semibold text-neutral-500 hover:text-neutral-900 dark:hover:text-white pt-2"
            >
              ← Back to Username / Email Login
            </button>
          </div>
        )}

        {/* Auth Mode: Forgot Password */}
        {authMode === 'FORGOT' && (
          <div className="space-y-4 text-xs">
            <h3 className="font-bold text-neutral-900 dark:text-white">Reset Terminal Password</h3>
            <p className="text-neutral-500">
              Enter your registered manager email address to receive password reset credentials.
            </p>
            <input
              type="email"
              placeholder="manager@ybinventory.local"
              className="w-full rounded border border-neutral-300 p-2 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
            />
            <button
              onClick={() => { showToast('Reset instructions sent to manager email', 'info'); setAuthMode('LOGIN'); }}
              className="w-full rounded-lg bg-neutral-900 py-2.5 font-bold text-white hover:bg-neutral-800"
            >
              Send Reset Link
            </button>
            <button
              type="button"
              onClick={() => setAuthMode('LOGIN')}
              className="w-full text-center text-neutral-500 hover:underline"
            >
              Back to Login
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
