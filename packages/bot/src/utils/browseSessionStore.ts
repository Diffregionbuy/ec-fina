// Simple in-memory session store for /shop browse message state
// TTL-based to avoid memory growth; swap to Redis later if needed for multi-instance.

import type { Product, Category } from '../types';

export interface BrowseSession {
  products: Product[];
  categories: Category[];
  selectedCategoryId?: string;
  selectedProductId?: string;
}

type Entry = { data: BrowseSession; expiresAt: number };

const SESSIONS = new Map<string, Entry>();
const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes

export function setBrowseSession(messageId: string, data: BrowseSession, ttlMs = DEFAULT_TTL_MS): void {
  SESSIONS.set(messageId, { data, expiresAt: Date.now() + ttlMs });
}

export function getBrowseSession(messageId: string): BrowseSession | null {
  const entry = SESSIONS.get(messageId);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    SESSIONS.delete(messageId);
    return null;
  }
  return entry.data;
}

export function updateBrowseSession(messageId: string, partial: Partial<BrowseSession>): void {
  const current = getBrowseSession(messageId);
  if (!current) return;
  setBrowseSession(messageId, { ...current, ...partial });
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