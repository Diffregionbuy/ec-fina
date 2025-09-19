# Multi-stage build for production
FROM node:18-alpine AS base

# Install security updates and required packages
RUN apk update && apk upgrade && \
    apk add --no-cache dumb-init && \
    rm -rf /var/cache/apk/*

# Create app directory and user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S ecbot -u 1001

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY packages/backend/package*.json ./packages/backend/
COPY packages/shared/package*.json ./packages/shared/

# Install dependencies
FROM base AS deps
RUN npm ci --only=production && npm cache clean --force

# Build stage
FROM base AS build
COPY . .
RUN npm ci && npm run build

# Production stage
FROM node:18-alpine AS production

# Install security updates
RUN apk update && apk upgrade && \
    apk add --no-cache dumb-init && \
    rm -rf /var/cache/apk/*

# Create app directory and user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S ecbot -u 1001

WORKDIR /app

# Copy built application
COPY --from=build --chown=ecbot:nodejs /app/packages/backend/dist ./dist
COPY --from=build --chown=ecbot:nodejs /app/packages/shared/dist ./shared
COPY --from=deps --chown=ecbot:nodejs /app/node_modules ./node_modules
COPY --from=deps --chown=ecbot:nodejs /app/packages/backend/node_modules ./packages/backend/node_modules

# Copy package.json for version info
COPY --chown=ecbot:nodejs packages/backend/package.json ./

# Create logs directory
RUN mkdir -p logs && chown ecbot:nodejs logs

# Switch to non-root user
USER ecbot

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3001/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) }).on('error', () => process.exit(1))"

# Expose port
EXPOSE 3001

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "dist/index.js"]