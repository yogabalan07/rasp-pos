import React from 'react';
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';

export const ToastContainer: React.FC = () => {
  const { toasts, dismissToast } = useApp();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm pointer-events-none">
      {toasts.map(toast => {
        const icons = {
          success: <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />,
          error: <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />,
          warning: <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />,
          info: <Info className="h-4 w-4 text-blue-500 shrink-0" />,
        };

        return (
          <div
            key={toast.id}
            className="pointer-events-auto flex items-center justify-between gap-3 rounded-lg border border-neutral-200 bg-white p-3 shadow-lg dark:border-neutral-700 dark:bg-neutral-800 text-xs text-neutral-800 dark:text-neutral-100 animate-in fade-in slide-in-from-bottom-2 duration-150"
          >
            <div className="flex items-center gap-2.5">
              {icons[toast.type]}
              <span className="font-medium leading-snug">{toast.message}</span>
            </div>
            <button
              onClick={() => dismissToast(toast.id)}
              className="text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 p-0.5"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
