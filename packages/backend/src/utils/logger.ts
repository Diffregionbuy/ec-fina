import winston from 'winston';

const logLevel = process.env.LOG_LEVEL || 'info';
const nodeEnv = process.env.NODE_ENV || 'development';

// Custom log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.prettyPrint()
);

// Console format for development
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let log = `${timestamp} [${level}]: ${message}`;
    if (Object.keys(meta).length > 0) {
      log += ` ${JSON.stringify(meta)}`;
    }
    return log;
  })
);

// Create logger instance
export const logger = winston.createLogger({
  level: logLevel,
  format: logFormat,
  defaultMeta: { service: 'ecbot-api' },
  transports: [
    // Console transport
    new winston.transports.Console({
      format: nodeEnv === 'development' ? consoleFormat : logFormat,
    }),
  ],
});

// Add file transport for production
if (nodeEnv === 'production') {
  // Error log
  logger.add(
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      format: logFormat,
      maxsize: parseInt(process.env.LOG_FILE_MAX_SIZE || '20971520'), // 20MB
      maxFiles: parseInt(process.env.LOG_FILE_MAX_FILES || '5'),
      tailable: true,
    })
  );
  
  // Combined log
  logger.add(
    new winston.transports.File({
      filename: 'logs/combined.log',
      format: logFormat,
      maxsize: parseInt(process.env.LOG_FILE_MAX_SIZE || '20971520'), // 20MB
      maxFiles: parseInt(process.env.LOG_FILE_MAX_FILES || '5'),
      tailable: true,
    })
  );
  
  // Access log for HTTP requests
  logger.add(
    new winston.transports.File({
      filename: 'logs/access.log',
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      maxsize: parseInt(process.env.LOG_FILE_MAX_SIZE || '20971520'), // 20MB
      maxFiles: parseInt(process.env.LOG_FILE_MAX_FILES || '5'),
      tailable: true,
    })
  );
}

// Handle uncaught exceptions and rejections
logger.exceptions.handle(
  new winston.transports.Console({
    format: consoleFormat,
  })
);

logger.rejections.handle(
  new winston.transports.Console({
    format: consoleFormat,
  })
);