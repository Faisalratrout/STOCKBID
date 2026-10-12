'use client';

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import Link from 'next/link';

interface Toast {
  id: number;
  message: string;
  href?: string;
}

interface ToastContextValue {
  showToast: (message: string, href?: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let nextId = 0;
const TOAST_DURATION_MS = 6000;

export const ToastProvider = ({ children }: { children: ReactNode }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, href?: string) => {
    const id = nextId++;
    setToasts((current) => [...current, { id, message, href }]);
    setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, TOAST_DURATION_MS);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="rounded-md bg-neutral-900 px-4 py-3 text-sm text-white shadow-lg"
          >
            {toast.href ? (
              <Link href={toast.href} className="underline">
                {toast.message}
              </Link>
            ) : (
              toast.message
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
};
