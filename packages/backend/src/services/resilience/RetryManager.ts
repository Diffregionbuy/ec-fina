import { logger } from '../../utils/logger';
import { RateLimitManager } from './RateLimitManager';

export interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  retryableErrors: string[];
}

export interface RetryResult<T> {
  success: boolean;
  data?: T;
  error?: ApiError;
  attempts: number;
  totalTime: number;
}

export interface ApiError {
  code: string;
  message: string;
  retryable: boolean;
  retryAfter?: number;
  statusCode?: number;
}

export class RetryManager {
  private config: RetryConfig;
  private rateLimitManager?: RateLimitManager;

  constructor(config: RetryConfig, rateLimitManager?: RateLimitManager) {
    this.config = config;
    this.rateLimitManager = rateLimitManager;
  }

  /**
   * Execute a function with retry logic and exponential backoff
   */
  async execute<T>(
    operation: () => Promise<T>,
    operationName: string = 'operation'
  ): Promise<RetryResult<T>> {
    const startTime = Date.now();
    let lastError: ApiError | undefined;
    let attempts = 0;

    for (attempts = 0; attempts <= this.config.maxRetries; attempts++) {
      try {
        // Only log in development if not disabled
        if (process.env.DISABLE_HEAVY_LOGGING !== 'true') {
          logger.debug(`Executing ${operationName}`, { 
            attempt: attempts + 1, 
            maxRetries: this.config.maxRetries + 1 
          });
        }

        const result = await operation();
        
        const totalTime = Date.now() - startTime;
        
        if (attempts > 0) {
          logger.info(`${operationName} succeeded after retries`, {
            attempts: attempts + 1,
            totalTime,
            recovered: true
          });
        }

        return {
          success: true,
          data: result,
          attempts: attempts + 1,
          totalTime
        };
      } catch (error) {
        const apiError = this.classifyError(error);
        lastError = apiError;

        // Only log in development if not disabled
        if (process.env.DISABLE_HEAVY_LOGGING !== 'true') {
          logger.debug(`${operationName} failed`, {
            attempt: attempts + 1,
            error: apiError.message,
            code: apiError.code,
            retryable: apiError.retryable,
            statusCode: apiError.statusCode
          });
        }

        // Handle rate limit errors specifically
        if (apiError.statusCode === 429 && this.rateLimitManager) {
          const rateLimitDelay = this.rateLimitManager.handleRateLimitError(error, operationName);
          apiError.retryAfter = rateLimitDelay / 1000; // Convert to seconds for consistency
        }

        // If error is not retryable, fail immediately
        if (!apiError.retryable) {
          logger.error(`${operationName} failed with non-retryable error`, {
            error: apiError.message,
            code: apiError.code,
            statusCode: apiError.statusCode
          });
          break;
        }

        // If we've exhausted retries, break
        if (attempts >= this.config.maxRetries) {
          logger.error(`${operationName} failed after all retries exhausted`, {
            totalAttempts: attempts + 1,
            maxRetries: this.config.maxRetries + 1,
            finalError: apiError.message
          });
          break;
        }

        // Calculate delay for next retry
        const delay = this.calculateDelay(attempts, apiError.retryAfter);
        
        // Only log in development if not disabled
        if (process.env.DISABLE_HEAVY_LOGGING !== 'true') {
          logger.debug(`Retrying ${operationName} after delay`, {
            nextAttempt: attempts + 2,
            delayMs: delay,
            retryAfter: apiError.retryAfter
          });
        }

        await this.sleep(delay);
      }
    }

    const totalTime = Date.now() - startTime;
    
    return {
      success: false,
      error: lastError,
      attempts: attempts + 1,
      totalTime
    };
  }

  /**
   * Calculate exponential backoff delay with jitter
   */
  private calculateDelay(attempt: number, retryAfter?: number): number {
    // If Discord provides Retry-After header, respect it with small buffer
    if (retryAfter) {
      const retryDelayMs = retryAfter * 1000; // Convert seconds to milliseconds
      // Add small buffer (100-500ms) to account for clock skew
      const buffer = 100 + Math.random() * 400;
      return retryDelayMs + buffer;
    }

    // Exponential backoff: baseDelay * 2^attempt
    const exponentialDelay = this.config.baseDelay * Math.pow(2, attempt);
    
    // Add jitter (±25% randomization) to prevent thundering herd
    const jitter = exponentialDelay * 0.25 * (Math.random() * 2 - 1);
    const delayWithJitter = exponentialDelay + jitter;
    
    // Cap at maxDelay
    return Math.min(delayWithJitter, this.config.maxDelay);
  }

  /**
   * Classify error to determine if it's retryable
   */
  private classifyError(error: any): ApiError {
    // Handle Axios errors
    if (error.response) {
      const statusCode = error.response.status;
      const statusText = error.response.statusText || 'Unknown Error';
      
      // Extract Retry-After header if present
      const retryAfter = error.response.headers && error.response.headers['retry-after'] 
        ? parseInt(error.response.headers['retry-after']) 
        : undefined;

      // Determine if error is retryable based on status code
      const retryable = this.isRetryableStatusCode(statusCode);
      
      return {
        code: `HTTP_${statusCode}`,
        message: `HTTP ${statusCode}: ${statusText}`,
        retryable,
        retryAfter,
        statusCode
      };
    }

    // Handle network/timeout errors
    if (error.code) {
      const retryable = this.config.retryableErrors.includes(error.code);
      
      return {
        code: error.code,
        message: error.message || 'Network error',
        retryable
      };
    }

    // Handle timeout errors
    if (error.message && error.message.includes('timeout')) {
      return {
        code: 'TIMEOUT',
        message: error.message,
        retryable: true
      };
    }

    // Default to non-retryable for unknown errors
    return {
      code: 'UNKNOWN_ERROR',
      message: error.message || 'Unknown error occurred',
      retryable: false
    };
  }

  /**
   * Determine if HTTP status code indicates a retryable error
   */
  private isRetryableStatusCode(statusCode: number): boolean {
    // 5xx server errors are generally retryable
    if (statusCode >= 500) {
      return true;
    }

    // 429 Too Many Requests is retryable
    if (statusCode === 429) {
      return true;
    }

    // 408 Request Timeout is retryable
    if (statusCode === 408) {
      return true;
    }

    // 4xx client errors are generally not retryable
    // except for specific cases handled above
    return false;
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Update retry configuration
   */
  updateConfig(newConfig: Partial<RetryConfig>): void {
    this.config = { ...this.config, ...newConfig };
    logger.info('RetryManager configuration updated', { config: this.config });
  }

  /**
   * Get current configuration
   */
  getConfig(): RetryConfig {
    return { ...this.config };
  }
}