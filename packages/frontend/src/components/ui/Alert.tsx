'use client';

import { HTMLAttributes, forwardRef } from 'react';
import { clsx } from 'clsx';
import { AlertCircle, CheckCircle, Info, AlertTriangle } from 'lucide-react';

interface AlertProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'success' | 'warning' | 'error';
  title?: string;
  description?: string;
}

const alertVariants = {
  default: {
    container: 'bg-blue-50 border-blue-200 text-blue-800',
    icon: Info,
    iconColor: 'text-blue-500',
  },
  success: {
    container: 'bg-green-50 border-green-200 text-green-800',
    icon: CheckCircle,
    iconColor: 'text-green-500',
  },
  warning: {
    container: 'bg-yellow-50 border-yellow-200 text-yellow-800',
    icon: AlertTriangle,
    iconColor: 'text-yellow-500',
  },
  error: {
    container: 'bg-red-50 border-red-200 text-red-800',
    icon: AlertCircle,
    iconColor: 'text-red-500',
  },
};

export const Alert = forwardRef<HTMLDivElement, AlertProps>(
  ({ className, variant = 'default', title, description, children, ...props }, ref) => {
    const { container, icon: Icon, iconColor } = alertVariants[variant];

    return (
      <div
        ref={ref}
        className={clsx(
          'border rounded-md p-4',
          container,
          className
        )}
        {...props}
      >
        <div className="flex">
          <Icon className={clsx('h-5 w-5 flex-shrink-0', iconColor)} />
          <div className="ml-3 flex-1">
            {title && (
              <h3 className="text-sm font-medium mb-1">
                {title}
              </h3>
            )}
            {description && (
              <p className="text-sm">
                {description}
              </p>
            )}
            {children && (
              <div className="text-sm">
                {children}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }
);

Alert.displayName = 'Alert';