import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';

// Create logs directory if it doesn't exist
const logsDir = path.join(process.cwd(), 'logs');

// Define log format
const logFormat = winston.format.combine(
    winston.format.timestamp({
        format: 'YYYY-MM-DD HH:mm:ss'
    }),
    winston.format.errors({ stack: true }),
    winston.format.json(),
    winston.format.prettyPrint()
);

// Console format for development
const consoleFormat = winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp({
        format: 'HH:mm:ss'
    }),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
        const safe = (input: any) => {
            try {
                return JSON.stringify(input, (_k, v) => {
                    if (v instanceof Error) {
                        return { name: v.name, message: v.message, stack: v.stack };
                    }
                    if (v && typeof v === 'object') {
                        if (v.req || v.res || v.socket || v.connection) return '[circular]';
                    }
                    return v;
                }, 2);
            } catch {
                return '[unserializable]';
            }
        };
        let msg = `${timestamp} [${level}]: ${message}`;
        if (Object.keys(meta).length > 0) {
            msg += ` ${safe(meta)}`;
        }
        return msg;
    })
);

// Create the logger
export const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: logFormat,
    defaultMeta: { service: 'discord-bot' },
    transports: [
        // Console transport for development
        new winston.transports.Console({
            format: consoleFormat,
            level: process.env.NODE_ENV === 'production' ? 'warn' : 'debug'
        }),

        // File transport for all logs
        new DailyRotateFile({
            filename: path.join(logsDir, 'bot-%DATE%.log'),
            datePattern: 'YYYY-MM-DD',
            zippedArchive: true,
            maxSize: '20m',
            maxFiles: '14d',
            level: 'info'
        }),

        // Error file transport
        new DailyRotateFile({
            filename: path.join(logsDir, 'error-%DATE%.log'),
            datePattern: 'YYYY-MM-DD',
            zippedArchive: true,
            maxSize: '20m',
            maxFiles: '30d',
            level: 'error'
        }),

        // Debug file transport (only in development)
        ...(process.env.NODE_ENV !== 'production' ? [
            new DailyRotateFile({
                filename: path.join(logsDir, 'debug-%DATE%.log'),
                datePattern: 'YYYY-MM-DD',
                zippedArchive: true,
                maxSize: '20m',
                maxFiles: '7d',
                level: 'debug'
            })
        ] : [])
    ],
    
    // Handle exceptions and rejections
    exceptionHandlers: [
        new DailyRotateFile({
            filename: path.join(logsDir, 'exceptions-%DATE%.log'),
            datePattern: 'YYYY-MM-DD',
            zippedArchive: true,
            maxSize: '20m',
            maxFiles: '30d'
        })
    ],
    
    rejectionHandlers: [
        new DailyRotateFile({
            filename: path.join(logsDir, 'rejections-%DATE%.log'),
            datePattern: 'YYYY-MM-DD',
            zippedArchive: true,
            maxSize: '20m',
            maxFiles: '30d'
        })
    ]
});

// Create specialized loggers for different components
export const commandLogger = logger.child({ component: 'commands' });
export const apiLogger = logger.child({ component: 'api' });
export const paymentLogger = logger.child({ component: 'payments' });
export const templateLogger = logger.child({ component: 'templates' });
export const eventLogger = logger.child({ component: 'events' });

// Helper functions for structured logging
export const logCommand = (commandName: string, userId: string, guildId?: string, success: boolean = true, error?: any) => {
    const logData = {
        command: commandName,
        userId,
        guildId,
        success,
        ...(error && { error: error.message || error })
    };

    if (success) {
        commandLogger.info('Command executed', logData);
    } else {
        commandLogger.error('Command failed', logData);
    }
};

export const logApiCall = (endpoint: string, method: string, success: boolean = true, responseTime?: number, error?: any) => {
    const logData = {
        endpoint,
        method,
        success,
        ...(responseTime && { responseTime: `${responseTime}ms` }),
        ...(error && { error: error.message || error })
    };

    if (success) {
        apiLogger.info('API call completed', logData);
    } else {
        apiLogger.error('API call failed', logData);
    }
};

export const logPayment = (orderId: string, action: string, success: boolean = true, amount?: number, currency?: string, error?: any) => {
    const logData = {
        orderId,
        action,
        success,
        ...(amount && { amount }),
        ...(currency && { currency }),
        ...(error && { error: error.message || error })
    };

    if (success) {
        paymentLogger.info('Payment action completed', logData);
    } else {
        paymentLogger.error('Payment action failed', logData);
    }
};

export const logTemplate = (templateName: string, serverId: string, action: string, success: boolean = true, error?: any) => {
    const logData = {
        template: templateName,
        serverId,
        action,
        success,
        ...(error && { error: error.message || error })
    };

    if (success) {
        templateLogger.info('Template action completed', logData);
    } else {
        templateLogger.error('Template action failed', logData);
    }
};

export const logEvent = (eventType: string, data: any, success: boolean = true, error?: any) => {
    const logData = {
        eventType,
        data,
        success,
        ...(error && { error: error.message || error })
    };

    if (success) {
        eventLogger.info('Event processed', logData);
    } else {
        eventLogger.error('Event processing failed', logData);
    }
};

// Export default logger
export default logger;