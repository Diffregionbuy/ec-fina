// Simple in-memory session store for /shop browse message state
// TTL-based to avoid memory growth; swap to Redis later if needed for multi-instance.

import type { Product, Category } from '../types';

export interface BrowseSession {
  products: Product[];
  categories: Category[];
  selectedCategoryId?: string;
  selectedProductId?: string;
  // Extended fields for payment tracking
  orderId?: string;
  orderNumber?: string;
  walletAddress?: string;
  exactAmount?: string;
  cryptoCurrency?: string;
  expiresAt?: string;
  paymentExpectedAmount?: number;
  paymentCurrency?: string;
}

type Entry = { data: BrowseSession; expiresAt: number };

const SESSIONS = new Map<string, Entry>();
const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes
const PAYMENT_SESSION_TTL_MS = 35 * 60 * 1000; // 35 minutes for payment sessions

export function setBrowseSession(messageId: string, data: BrowseSession, ttlMs = DEFAULT_TTL_MS): void {
  // Use longer TTL for payment sessions
  const finalTtl = data.orderId ? PAYMENT_SESSION_TTL_MS : ttlMs;
  const expiresAt = Date.now() + finalTtl;
  
  console.log('setBrowseSession:', {
    messageId,
    hasOrderId: !!data.orderId,
    orderId: data.orderId,
    finalTtl,
    expiresAt: new Date(expiresAt).toISOString(),
    dataKeys: Object.keys(data)
  });
  
  SESSIONS.set(messageId, { data, expiresAt });
}

export function getBrowseSession(messageId: string): BrowseSession | null {
  const entry = SESSIONS.get(messageId);
  if (!entry) {
    console.log('getBrowseSession: No entry found for messageId:', messageId);
    return null;
  }
  
  if (Date.now() > entry.expiresAt) {
    console.log('getBrowseSession: Session expired for messageId:', messageId, {
      expiresAt: new Date(entry.expiresAt).toISOString(),
      now: new Date().toISOString()
    });
    SESSIONS.delete(messageId);
    return null;
  }
  
  console.log('getBrowseSession: Found session for messageId:', messageId, {
    hasOrderId: !!entry.data.orderId,
    keys: Object.keys(entry.data)
  });
  
  return entry.data;
}

export function updateBrowseSession(messageId: string, partial: Partial<BrowseSession>): void {
  const current = getBrowseSession(messageId);
  if (!current) {
    console.log('updateBrowseSession: No current session found for messageId:', messageId);
    console.log('updateBrowseSession: Available sessions:', Array.from(SESSIONS.keys()));
    return;
  }
  
  const updated = { ...current, ...partial };
  console.log('updateBrowseSession: Updating session', {
    messageId,
    currentKeys: Object.keys(current),
    partialKeys: Object.keys(partial),
    updatedKeys: Object.keys(updated),
    hasOrderId: !!updated.orderId,
    orderIdValue: updated.orderId
  });
  
  setBrowseSession(messageId, updated);
  
  // Verify the update worked
  const verified = getBrowseSession(messageId);
  console.log('updateBrowseSession: Verification after update', {
    messageId,
    verifiedOrderId: verified?.orderId,
    updateSuccessful: verified?.orderId === updated.orderId
  });
}

export function clearBrowseSession(messageId: string): void {
  SESSIONS.delete(messageId);
}

// Optional manual sweep
export function sweepExpiredSessions(): void {
  const now = Date.now();
  for (const [k, v] of SESSIONS.entries()) {
    if (now > v.expiresAt) SESSIONS.delete(k);
  }
}

// Debug function to list all sessions
export function listAllSessions(): Array<{ messageId: string; hasOrderId: boolean; orderId?: string; expiresAt: string }> {
  const now = Date.now();
  const sessions = [];
  for (const [messageId, entry] of SESSIONS.entries()) {
    sessions.push({
      messageId,
      hasOrderId: !!entry.data.orderId,
      orderId: entry.data.orderId,
      expiresAt: new Date(entry.expiresAt).toISOString(),
      expired: now > entry.expiresAt
    });
  }
  return sessions;
}