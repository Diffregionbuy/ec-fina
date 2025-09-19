import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

interface DiscordTokens {
  accessToken: string;
  refreshToken: string;
  discordId: string;
  expiresAt: number;
}

interface IsolatedSession {
  userId: string;
  discordId: string;
  discordTokens: DiscordTokens;
  createdAt: number;
  lastUsed: number;
}

// In-memory session store (in production, use Redis or database)
const sessionStore = new Map<string, IsolatedSession>();

export function generateSessionId(discordId: string): string {
  // Create a unique session ID that includes the Discord ID
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2);
  return `session_${discordId}_${timestamp}_${random}`;
}

export function createIsolatedSession(
  userId: string, 
  discordTokens: DiscordTokens
): string {
  const sessionId = generateSessionId(discordTokens.discordId);
  
  const session: IsolatedSession = {
    userId,
    discordId: discordTokens.discordId,
    discordTokens,
    createdAt: Date.now(),
    lastUsed: Date.now()
  };
  
  sessionStore.set(sessionId, session);
  
  // Clean up old sessions for this Discord ID (keep only the latest)
  cleanupOldSessions(discordTokens.discordId);
  
  return sessionId;
}

export function getIsolatedSession(sessionId: string): IsolatedSession | null {
  const session = sessionStore.get(sessionId);
  if (!session) return null;
  
  // Update last used timestamp
  session.lastUsed = Date.now();
  sessionStore.set(sessionId, session);
  
  return session;
}

export function cleanupOldSessions(discordId: string): void {
  const sessions = Array.from(sessionStore.entries())
    .filter(([_, session]) => session.discordId === discordId)
    .sort(([_, a], [__, b]) => b.createdAt - a.createdAt);
  
  // Keep only the most recent session for each Discord ID
  sessions.slice(1).forEach(([sessionId]) => {
    sessionStore.delete(sessionId);
  });
}

export function sessionIsolationMiddleware(
  req: Request, 
  res: Response, 
  next: NextFunction
): void {
  const sessionId = req.headers['x-session-id'] as string;
  
  if (sessionId) {
    const session = getIsolatedSession(sessionId);
    if (session) {
      // Attach session data to request
      req.isolatedSession = session;
    }
  }
  
  next();
}

// Extend Request interface
declare global {
  namespace Express {
    interface Request {
      isolatedSession?: IsolatedSession;
    }
  }
}