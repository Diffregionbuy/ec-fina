'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { clsx } from 'clsx';
import { CheckCircle, AlertCircle, Info, AlertTriangle, X } from 'lucide-react';

interface ToastProps {
  id: string;
  variant?: 'default' | 'success' | 'warning' | 'error';
  title?: string;
  description?: string;
  duration?: number;
  onClose: (id: string) => void;
}

const toastVariants = {
  default: {
    container: 'bg-white border-gray-200 text-gray-800',
    icon: Info,
    iconColor: 'text-blue-500',
  },
  success: {
    container: 'bg-white border-green-200 text-green-800',
    icon: CheckCircle,
    iconColor: 'text-green-500',
  },
  warning: {
    container: 'bg-white border-yellow-200 text-yellow-800',
    icon: AlertTriangle,
    iconColor: 'text-yellow-500',
  },
  error: {
    container: 'bg-white border-red-200 text-red-800',
    icon: AlertCircle,
    iconColor: 'text-red-500',
  },
};

export function Toast({ id, variant = 'default', title, description, duration = 5000, onClose }: ToastProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);

  const { container, icon: Icon, iconColor } = toastVariants[variant];

  useEffect(() => {
    // Trigger entrance animation
    const timer = setTimeout(() => setIsVisible(true), 10);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(() => {
        handleClose();
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [duration]);

  const handleClose = () => {
    setIsLeaving(true);
    setTimeout(() => {
      onClose(id);
    }, 300);
  };

  const toastElement = (
    <div
      className={clsx(
        'fixed top-4 right-4 z-50 w-96 max-w-sm border rounded-lg shadow-lg transition-all duration-300 ease-in-out transform',
        container,
        isVisible && !isLeaving ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'
      )}
    >
      <div className="p-4">
        <div className="flex items-start">
          <Icon className={clsx('h-5 w-5 flex-shrink-0 mt-0.5', iconColor)} />
          <div className="ml-3 flex-1">
            {title && (
              <h3 className="text-sm font-medium mb-1">
                {title}
              </h3>
            )}
            {description && (
              <p className="text-sm opacity-90">
                {description}
              </p>
            )}
          </div>
          <button
            onClick={handleClose}
            className="ml-4 flex-shrink-0 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return typeof window !== 'undefined' ? createPortal(toastElement, document.body) : null;
}

// Toast Manager
interface ToastData {
  id: string;
  variant?: 'default' | 'success' | 'warning' | 'error';
  title?: string;
  description?: string;
  duration?: number;
}

class ToastManager {
  private toasts: ToastData[];
  private listeners: ((toasts: ToastData[]) => void)[];

  constructor() {
    this.toasts = [];
    this.listeners = [];
  }

  subscribe(listener: (toasts: ToastData[]) => void) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notify() {
    this.listeners.forEach(listener => listener([...this.toasts]));
  }

  show(toast: Omit<ToastData, 'id'>) {
    const id = Math.random().toString(36).substr(2, 9);
    const newToast = { ...toast, id };
    if (!this.toasts) {
      this.toasts = [];
    }
    this.toasts.push(newToast);
    this.notify();
    return id;
  }

  remove(id: string) {
    if (!this.toasts) {
      this.toasts = [];
      return;
    }
    this.toasts = this.toasts.filter(toast => toast.id !== id);
    this.notify();
  }

  success(title: string, description?: string) {
    return this.show({ variant: 'success', title, description });
  }

  error(title: string, description?: string) {
    return this.show({ variant: 'error', title, description });
  }

  warning(title: string, description?: string) {
    return this.show({ variant: 'warning', title, description });
  }

  info(title: string, description?: string) {
    return this.show({ variant: 'default', title, description });
  }
}

export const toast = new ToastManager();

// Toast Container Component
interface ToastContainerProps {
  toasts?: ToastData[];
  onRemove?: (id: string) => void;
}

export function ToastContainer({ toasts: propToasts, onRemove: propOnRemove }: ToastContainerProps = {}) {
  const [contextToasts, setContextToasts] = useState<ToastData[]>([]);

  useEffect(() => {
    if (!propToasts) {
      const unsubscribe = toast.subscribe(setContextToasts);
      return unsubscribe;
    }
  }, [propToasts]);

  // Use props if provided, otherwise use context
  const toasts = propToasts || contextToasts;
  const onRemove = propOnRemove || toast.remove.bind(toast);

  return (
    <>
      {toasts.map((toastData) => (
        <Toast
          key={toastData.id}
          {...toastData}
          onClose={onRemove}
        />
      ))}
    </>
  );
}
