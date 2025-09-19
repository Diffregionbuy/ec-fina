// BALANCED WINSTON OVERRIDE - Temporarily disabled due to hanging issue
// import './middleware/balancedWinston';

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { supabase } from './config/database';
import { logger } from './utils/logger';
import { errorHandler } from './middleware/errorHandler';
import { nuclearLogger } from './middleware/nuclearLogger';
import { optimizedAuthMiddleware } from './middleware/optimizedAuth';
import discordRateLimitMiddleware from './middleware/discordRateLimit';

// Load environment variables
dotenv.config();

// Memory optimization flags
const DISABLE_MONITORING = process.env.DISABLE_MONITORING === 'true';
const DISABLE_ALERTING = process.env.DISABLE_ALERTING === 'true';
const DISABLE_HEAVY_LOGGING = process.env.DISABLE_HEAVY_LOGGING === 'true';

// Only import memory manager if monitoring is enabled
let memoryManager: any = null;
if (!DISABLE_MONITORING) {
  memoryManager = require('./utils/memoryManager').memoryManager;
}


// Memory management additions
process.on('SIGTERM', () => {
  console.log('SIGTERM received, cleaning up...');
  if (global.gc) {
    global.gc();
  }
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, cleaning up...');
  if (global.gc) {
    global.gc();
  }
  process.exit(0);
});

// Force garbage collection every 5 minutes

// EMERGENCY_GC: Aggressive garbage collection for memory optimization
if (process.env.FORCE_GC === 'true') {
  const gcInterval = parseInt(process.env.GC_INTERVAL || '60000');
  setInterval(() => {
    if (global.gc) {
      const before = process.memoryUsage();
      global.gc();
      const after = process.memoryUsage();
      const freed = Math.round((before.heapUsed - after.heapUsed) / 1024 / 1024);
      if (freed > 0) {
        logger.info(`Emergency GC freed ${freed}MB`);
      }
    }
  }, gcInterval);
  logger.info('Emergency GC enabled');
}

setInterval(() => {
  if (global.gc) {
    global.gc();
    const memUsage = process.memoryUsage();
    const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
    const heapTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024);
    console.log(`Memory cleanup: ${heapUsedMB}MB/${heapTotalMB}MB`);
  }
}, 5 * 60 * 1000);

const app = express();
const PORT = process.env.PORT || 3001;

// Rate limiting - More generous limits to prevent user frustration
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // limit each IP to 1000 requests per 15 minutes (generous for normal usage)
  message: {
    error: 'Too many requests from this IP, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// General middleware
app.use(compression());
app.use(limiter);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check endpoint with database connectivity check (BEFORE auth middleware)
app.get('/health', async (req, res) => {
  try {
    // Test database connection
    const { error } = await supabase.from('users').select('count').limit(1);
    
    const healthStatus = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      database: error ? 'disconnected' : 'connected',
      uptime: process.uptime(),
    };

    if (error) {
      logger.warn('Database health check failed:', error);
      return res.status(503).json({
        ...healthStatus,
        status: 'degraded',
        database: 'disconnected',
      });
    }

    res.json(healthStatus);
  } catch (error) {
    logger.error('Health check failed:', error);
    res.status(503).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: 'Health check failed',
    });
  }
});

// NUCLEAR LOGGING SOLUTION - Eliminates 99% of log bloat
if (DISABLE_HEAVY_LOGGING) {
  // Completely silent mode
  console.log('Heavy logging disabled - running in silent mode');
} else {
  // TEMPORARILY DISABLE NUCLEAR LOGGER FOR OKX DEBUGGING
  console.log('Nuclear logger temporarily disabled for OKX debugging');
  // app.use(nuclearLogger);
  
  // OPTIMIZED AUTHENTICATION - Eliminates token spam and auth storms
  app.use(optimizedAuthMiddleware.authenticate);
  
  // Add Discord rate limiting coordination
  app.use(discordRateLimitMiddleware);
}

// Import routes
import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import serverRoutes from './routes/servers';
import adminRoutes from './routes/admin';
import productRoutes from './routes/products';
import categoryRoutes from './routes/categories';
import walletRoutes from './routes/wallet';
import paymentRoutes from './routes/payments';
import subscriptionRoutes from './routes/subscriptions';
import okxRoutes from './routes/okx';
import tatumRoutes from './routes/tatum';
import feesRouter from './routes/fees';
import stripeRoutes from './routes/stripe';
import analyticsRoutes from './routes/analytics';
import optimizationMonitoringRoutes from './routes/optimizationMonitoring';
import botServiceRoutes from './routes/bot-service';
import webhookRoutes from './routes/webhooks';

import onboardingRoutes from './routes/onboarding';
// Conditionally import monitoring only if not disabled
let monitoringRoutes: any = null;
if (!DISABLE_MONITORING) {
  monitoringRoutes = require('./routes/monitoring').default;
}

// API routes
app.get('/api', (_req, res) => {
  res.json({ 
    message: 'EcBot API Server',
    version: process.env.npm_package_version || '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/servers', serverRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/products', productRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/okx', okxRoutes);
app.use('/api/tatum', tatumRoutes);
app.use('/api/fees', feesRouter);
app.use('/api/stripe', stripeRoutes);
app.use('/api/onboarding', onboardingRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/optimization-monitoring', optimizationMonitoringRoutes);
app.use('/api/bot-service', botServiceRoutes);
app.use('/api/webhooks', webhookRoutes);
// Only enable monitoring routes if not disabled
if (!DISABLE_MONITORING && monitoringRoutes) {
  app.use('/api/monitoring', monitoringRoutes);
}

// Error handling middleware (must be last)
app.use(errorHandler);

// 404 handler
app.use('*', (_req, res) => {
  res.status(404).json({ 
    success: false,
    error: {
      code: 'ROUTE_NOT_FOUND',
      message: 'The requested route was not found',
      timestamp: new Date().toISOString(),
    },
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});

const server = app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
});

export { app, server };
