import { logger } from '../../utils/logger';

export interface TimeoutConfig {
  defaultTimeout: number;
  connectionTimeout: number;
  readTimeout: number;
  writeTimeout: number;
}

export interface TimeoutOptions {
  timeout?: number;
  signal?: AbortSignal;
  timeoutMessage?: string;
}

export class TimeoutManager {
  private config: TimeoutConfig;

  constructor(config: TimeoutConfig) {
    this.config = config;
  }

  /**
   * Create an AbortController with timeout
   */
  createTimeoutController(timeoutMs?: number): AbortController {
    const controller = new AbortController();
    const timeout = timeoutMs || this.config.defaultTimeout;

    const timeoutId = setTimeout(() => {
      controller.abort();
      // Only log timeouts in development if not disabled
      if (process.env.DISABLE_HEAVY_LOGGING !== 'true') {
        logger.debug('Operation timed out', { timeoutMs: timeout });
      }
    }, timeout);

    // Clean up timeout when operation completes
    controller.signal.addEventListener('abort', () => {
      clearTimeout(timeoutId);
    });

    return controller;
  }

  /**
   * Wrap a promise with timeout functionality
   */
  async withTimeout<T>(
    promise: Promise<T>,
    options: TimeoutOptions = {}
  ): Promise<T> {
    const timeout = options.timeout || this.config.defaultTimeout;
    const timeoutMessage = options.timeoutMessage || `Operation timed out after ${timeout}ms`;

    // If external signal is provided, use it
    if (options.signal) {
      return this.raceWithSignal(promise, options.signal, timeoutMessage);
    }

    // Create internal timeout controller
    const controller = this.createTimeoutController(timeout);
    
    try {
      return await this.raceWithSignal(promise, controller.signal, timeoutMessage);
    } finally {
      controller.abort(); // Clean up
    }
  }

  /**
   * Race promise against abort signal
   */
  private async raceWithSignal<T>(
    promise: Promise<T>,
    signal: AbortSignal,
    timeoutMessage: string
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      // Handle abort signal
      const onAbort = () => {
        reject(new TimeoutError(timeoutMessage));
      };

      if (signal.aborted) {
        reject(new TimeoutError(timeoutMessage));
        return;
      }

      signal.addEventListener('abort', onAbort);

      // Handle promise resolution/rejection
      promise
        .then((result) => {
          signal.removeEventListener('abort', onAbort);
          resolve(result);
        })
        .catch((error) => {
          signal.removeEventListener('abort', onAbort);
          reject(error);
        });
    });
  }

  /**
   * Create timeout configuration for Axios
   */
  createAxiosTimeoutConfig(options: Partial<TimeoutOptions> = {}) {
    return {
      timeout: options.timeout || this.config.defaultTimeout,
      signal: options.signal,
    };
  }

  /**
   * Create timeout configuration for fetch
   */
  createFetchTimeoutConfig(options: Partial<TimeoutOptions> = {}): RequestInit {
    return {
      signal: options.signal || this.createTimeoutController(options.timeout).signal,
    };
  }

  /**
   * Validate timeout values
   */
  static validateTimeout(timeout: number): void {
    if (timeout <= 0) {
      throw new Error('Timeout must be greater than 0');
    }
    if (timeout > 300000) { // 5 minutes
      logger.warn('Timeout is very high', { timeout });
    }
  }

  /**
   * Update timeout configuration
   */
  updateConfig(newConfig: Partial<TimeoutConfig>): void {
    // Validate new timeout values
    Object.values(newConfig).forEach(timeout => {
      if (timeout !== undefined) {
        TimeoutManager.validateTimeout(timeout);
      }
    });

    this.config = { ...this.config, ...newConfig };
    logger.info('TimeoutManager configuration updated', { config: this.config });
  }

  /**
   * Get current configuration
   */
  getConfig(): TimeoutConfig {
    return { ...this.config };
  }

  /**
   * Get recommended timeout for operation type
   */
  getTimeoutForOperation(operationType: 'api' | 'database' | 'file' | 'network'): number {
    switch (operationType) {
      case 'api':
        return this.config.defaultTimeout;
      case 'database':
        return Math.min(this.config.defaultTimeout, 30000); // Max 30s for DB
      case 'file':
        return this.config.readTimeout;
      case 'network':
        return this.config.connectionTimeout;
      default:
        return this.config.defaultTimeout;
    }
  }
}

/**
 * Custom timeout error class
 */
export class TimeoutError extends Error {
  public readonly name = 'TimeoutError';
  public readonly code = 'TIMEOUT';

  constructor(message: string = 'Operation timed out') {
    super(message);
    
    // Maintain proper stack trace for where our error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, TimeoutError);
    }
  }
}

/**
 * Utility function to create a timeout promise
 */
export function createTimeoutPromise(ms: number, message?: string): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => {
      reject(new TimeoutError(message || `Timeout after ${ms}ms`));
    }, ms);
  });
}

/**
 * Utility function to add timeout to any promise
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message?: string
): Promise<T> {
  return Promise.race([
    promise,
    createTimeoutPromise(timeoutMs, message)
  ]);
}