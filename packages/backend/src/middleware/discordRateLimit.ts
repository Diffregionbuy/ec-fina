import { Request, Response, NextFunction } from 'express';

// Discord API Request Coordination - Prevents rate limit spam
class DiscordRequestCoordinator {
  private pendingRequests = new Map<string, Promise<any>>();
  private requestQueue = new Map<string, Array<{ resolve: Function; reject: Function }>>();
  private lastRequestTime = new Map<string, number>();
  
  // Minimum delay between requests to same endpoint
  private readonly MIN_DELAY = 1100; // 1.1 seconds (Discord allows 1/second)

  async coordinateRequest<T>(
    endpoint: string,
    requestFn: () => Promise<T>
  ): Promise<T> {
    const key = this.getEndpointKey(endpoint);
    
    // If there's already a pending request for this endpoint, wait for it
    if (this.pendingRequests.has(key)) {
      return this.pendingRequests.get(key) as Promise<T>;
    }

    // Check if we need to wait due to rate limiting
    const lastRequest = this.lastRequestTime.get(key) || 0;
    const now = Date.now();
    const timeSinceLastRequest = now - lastRequest;
    
    if (timeSinceLastRequest < this.MIN_DELAY) {
      const waitTime = this.MIN_DELAY - timeSinceLastRequest;
      await this.sleep(waitTime);
    }

    // Create the request promise
    const requestPromise = this.executeRequest(key, requestFn);
    this.pendingRequests.set(key, requestPromise);

    try {
      const result = await requestPromise;
      return result;
    } finally {
      // Clean up
      this.pendingRequests.delete(key);
      this.lastRequestTime.set(key, Date.now());
    }
  }

  private async executeRequest<T>(key: string, requestFn: () => Promise<T>): Promise<T> {
    try {
      const result = await requestFn();
      
      // Resolve any queued requests with the same result
      const queue = this.requestQueue.get(key) || [];
      queue.forEach(({ resolve }) => resolve(result));
      this.requestQueue.delete(key);
      
      return result;
    } catch (error) {
      // Reject any queued requests
      const queue = this.requestQueue.get(key) || [];
      queue.forEach(({ reject }) => reject(error));
      this.requestQueue.delete(key);
      
      throw error;
    }
  }

  private getEndpointKey(endpoint: string): string {
    // Group similar endpoints together
    if (endpoint.includes('/users/@me/guilds')) return 'user-guilds';
    if (endpoint.includes('/guilds/') && endpoint.includes('/members')) return 'guild-members';
    if (endpoint.includes('/guilds/') && !endpoint.includes('/')) return 'guild-details';
    return endpoint;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Global coordinator instance
const discordCoordinator = new DiscordRequestCoordinator();

// Middleware to coordinate Discord API requests
export const discordRateLimitMiddleware = (req: Request, res: Response, next: NextFunction) => {
  // Add coordinator to request object for services to use
  (req as any).discordCoordinator = discordCoordinator;
  next();
};

export { discordCoordinator };
export default discordRateLimitMiddleware;