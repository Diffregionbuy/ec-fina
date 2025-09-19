import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number, currency: string): string {
  const currencySymbols: Record<string, string> = {
    USD: '$',
    EUR: '€',
    GBP: '£',
    BTC: '₿',
    ETH: 'Ξ',
  };

  const symbol = currencySymbols[currency] || currency;
  
  if (currency === 'BTC' || currency === 'ETH') {
    // For crypto, show more decimal places
    return `${symbol}${amount.toFixed(8)}`;
  }
  
  return `${symbol}${amount.toFixed(2)}`;
}