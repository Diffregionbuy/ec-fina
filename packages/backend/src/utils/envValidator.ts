import Joi from 'joi';
import { logger } from './logger';

// Environment validation schema
const envSchema = Joi.object({
  // Node environment
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  
  // Server configuration
  PORT: Joi.number().port().default(3001),
  API_BASE_URL: Joi.string().uri().required(),
  FRONTEND_URL: Joi.string().uri().required(),
  
  // Database configuration
  SUPABASE_URL: Joi.string().uri().required(),
  SUPABASE_ANON_KEY: Joi.string().required(),
  SUPABASE_SERVICE_ROLE_KEY: Joi.string().required(),
  
  // Discord configuration
  DISCORD_CLIENT_ID: Joi.string().required(),
  DISCORD_CLIENT_SECRET: Joi.string().required(),
  DISCORD_BOT_TOKEN: Joi.string().required(),
  DISCORD_REDIRECT_URI: Joi.string().uri().required(),
  
  // Authentication configuration
  NEXTAUTH_URL: Joi.string().uri().required(),
  NEXTAUTH_SECRET: Joi.string().min(32).required(),
  JWT_SECRET: Joi.string().min(32).required(),
  JWT_EXPIRES_IN: Joi.string().default('7d'),
  
  // OKX API configuration
  OKX_API_KEY: Joi.string().required(),
  OKX_SECRET_KEY: Joi.string().required(),
  OKX_PASSPHRASE: Joi.string().required(),
  OKX_SANDBOX: Joi.boolean().default(true),
  
  // Redis configuration
  REDIS_URL: Joi.string().uri().optional(),
  REDIS_PASSWORD: Joi.string().optional(),
  REDIS_TLS: Joi.boolean().default(false),
  
  // Security configuration
  RATE_LIMIT_WINDOW_MS: Joi.number().default(900000),
  RATE_LIMIT_MAX_REQUESTS: Joi.number().default(100),
  CORS_ORIGINS: Joi.string().default('http://localhost:3000'),
  
  // Logging configuration
  LOG_LEVEL: Joi.string()
    .valid('error', 'warn', 'info', 'debug')
    .default('info'),
  LOG_FILE_MAX_SIZE: Joi.number().default(20971520),
  LOG_FILE_MAX_FILES: Joi.number().default(5),
  
  // Monitoring configuration
  HEALTH_CHECK_TIMEOUT: Joi.number().default(5000),
  HEALTH_CHECK_INTERVAL: Joi.number().default(30000),
  
  // Optional monitoring services
  SENTRY_DSN: Joi.string().uri().optional(),
  DATADOG_API_KEY: Joi.string().optional(),
  
  // Session configuration
  SESSION_SECRET: Joi.string().min(32).optional(),
  SESSION_MAX_AGE: Joi.number().default(604800000),
}).unknown(true); // Allow unknown environment variables

// Production-specific validation
const productionSchema = envSchema.keys({
  NODE_ENV: Joi.string().valid('production').required(),
  NEXTAUTH_SECRET: Joi.string().min(32).required(),
  JWT_SECRET: Joi.string().min(32).required(),
  OKX_SANDBOX: Joi.boolean().valid(false).required(),
  REDIS_URL: Joi.string().uri().required(),
  SENTRY_DSN: Joi.string().uri().optional(),
});

export interface ValidatedEnv {
  NODE_ENV: 'development' | 'test' | 'production';
  PORT: number;
  API_BASE_URL: string;
  FRONTEND_URL: string;
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  DISCORD_CLIENT_ID: string;
  DISCORD_CLIENT_SECRET: string;
  DISCORD_BOT_TOKEN: string;
  DISCORD_REDIRECT_URI: string;
  NEXTAUTH_URL: string;
  NEXTAUTH_SECRET: string;
  JWT_SECRET: string;
  JWT_EXPIRES_IN: string;
  OKX_API_KEY: string;
  OKX_SECRET_KEY: string;
  OKX_PASSPHRASE: string;
  OKX_SANDBOX: boolean;
  REDIS_URL?: string;
  REDIS_PASSWORD?: string;
  REDIS_TLS: boolean;
  RATE_LIMIT_WINDOW_MS: number;
  RATE_LIMIT_MAX_REQUESTS: number;
  CORS_ORIGINS: string;
  LOG_LEVEL: string;
  LOG_FILE_MAX_SIZE: number;
  LOG_FILE_MAX_FILES: number;
  HEALTH_CHECK_TIMEOUT: number;
  HEALTH_CHECK_INTERVAL: number;
  SENTRY_DSN?: string;
  DATADOG_API_KEY?: string;
  SESSION_SECRET?: string;
  SESSION_MAX_AGE: number;
}

export function validateEnvironment(): ValidatedEnv {
  const schema = process.env.NODE_ENV === 'production' ? productionSchema : envSchema;
  
  const { error, value } = schema.validate(process.env, {
    abortEarly: false,
    stripUnknown: false,
  });

  if (error) {
    const errorMessages = error.details.map(detail => {
      const key = detail.path.join('.');
      const message = detail.message;
      return `${key}: ${message}`;
    });

    logger.error('Environment validation failed:', {
      errors: errorMessages,
      environment: process.env.NODE_ENV,
    });

    throw new Error(`Environment validation failed:\n${errorMessages.join('\n')}`);
  }

  // Additional security checks for production
  if (value.NODE_ENV === 'production') {
    const securityChecks = [];

    // Check for default/weak secrets
    if (value.JWT_SECRET.includes('secret') || value.JWT_SECRET.length < 32) {
      securityChecks.push('JWT_SECRET appears to be weak or default');
    }

    if (value.NEXTAUTH_SECRET.includes('secret') || value.NEXTAUTH_SECRET.length < 32) {
      securityChecks.push('NEXTAUTH_SECRET appears to be weak or default');
    }

    // Check for development URLs in production
    if (value.API_BASE_URL.includes('localhost') || value.API_BASE_URL.includes('127.0.0.1')) {
      securityChecks.push('API_BASE_URL should not use localhost in production');
    }

    if (value.FRONTEND_URL.includes('localhost') || value.FRONTEND_URL.includes('127.0.0.1')) {
      securityChecks.push('FRONTEND_URL should not use localhost in production');
    }

    // Check for sandbox mode in production
    if (value.OKX_SANDBOX === true) {
      securityChecks.push('OKX_SANDBOX should be false in production');
    }

    if (securityChecks.length > 0) {
      logger.error('Production security validation failed:', {
        checks: securityChecks,
      });

      throw new Error(`Production security validation failed:\n${securityChecks.join('\n')}`);
    }
  }

  logger.info('Environment validation passed', {
    environment: value.NODE_ENV,
    port: value.PORT,
    redisConfigured: !!value.REDIS_URL,
    sentryConfigured: !!value.SENTRY_DSN,
  });

  return value as ValidatedEnv;
}

// Utility function to check if required services are configured
export function checkServiceConfiguration(env: ValidatedEnv) {
  const services = {
    database: {
      configured: !!(env.SUPABASE_URL && env.SUPABASE_ANON_KEY && env.SUPABASE_SERVICE_ROLE_KEY),
      required: true,
    },
    discord: {
      configured: !!(env.DISCORD_CLIENT_ID && env.DISCORD_CLIENT_SECRET && env.DISCORD_BOT_TOKEN),
      required: true,
    },
    okx: {
      configured: !!(env.OKX_API_KEY && env.OKX_SECRET_KEY && env.OKX_PASSPHRASE),
      required: true,
    },
    redis: {
      configured: !!env.REDIS_URL,
      required: env.NODE_ENV === 'production',
    },
    monitoring: {
      configured: !!(env.SENTRY_DSN || env.DATADOG_API_KEY),
      required: env.NODE_ENV === 'production',
    },
  };

  const missingServices = Object.entries(services)
    .filter(([, config]) => config.required && !config.configured)
    .map(([name]) => name);

  if (missingServices.length > 0) {
    throw new Error(`Required services not configured: ${missingServices.join(', ')}`);
  }

  const configuredServices = Object.entries(services)
    .filter(([, config]) => config.configured)
    .map(([name]) => name);

  logger.info('Service configuration check passed', {
    configured: configuredServices,
    environment: env.NODE_ENV,
  });

  return services;
}