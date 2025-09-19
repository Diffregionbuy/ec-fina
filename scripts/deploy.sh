#!/bin/bash

# EcBot Production Deployment Script
set -e

echo "🚀 Starting EcBot deployment..."

# Configuration
DEPLOY_ENV=${1:-production}
BUILD_DIR="dist"
BACKUP_DIR="backups/$(date +%Y%m%d_%H%M%S)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check if Node.js is installed
    if ! command -v node &> /dev/null; then
        log_error "Node.js is not installed"
        exit 1
    fi
    
    # Check if npm is installed
    if ! command -v npm &> /dev/null; then
        log_error "npm is not installed"
        exit 1
    fi
    
    # Check Node.js version
    NODE_VERSION=$(node --version | cut -d'v' -f2)
    REQUIRED_VERSION="18.0.0"
    
    if ! node -e "process.exit(require('semver').gte('$NODE_VERSION', '$REQUIRED_VERSION') ? 0 : 1)" 2>/dev/null; then
        log_error "Node.js version $NODE_VERSION is not supported. Required: >= $REQUIRED_VERSION"
        exit 1
    fi
    
    log_info "Prerequisites check passed"
}

# Load environment variables
load_environment() {
    log_info "Loading environment variables for $DEPLOY_ENV..."
    
    if [ -f ".env.$DEPLOY_ENV" ]; then
        export $(cat .env.$DEPLOY_ENV | grep -v '^#' | xargs)
        log_info "Environment variables loaded from .env.$DEPLOY_ENV"
    elif [ -f ".env" ]; then
        export $(cat .env | grep -v '^#' | xargs)
        log_warn "Using default .env file"
    else
        log_error "No environment file found"
        exit 1
    fi
}

# Create backup
create_backup() {
    if [ -d "$BUILD_DIR" ]; then
        log_info "Creating backup..."
        mkdir -p "$BACKUP_DIR"
        cp -r "$BUILD_DIR" "$BACKUP_DIR/"
        log_info "Backup created at $BACKUP_DIR"
    fi
}

# Install dependencies
install_dependencies() {
    log_info "Installing dependencies..."
    npm ci --only=production
    log_info "Dependencies installed"
}

# Run tests
run_tests() {
    log_info "Running tests..."
    npm run test:ci
    log_info "All tests passed"
}

# Build application
build_application() {
    log_info "Building application..."
    
    # Clean previous build
    rm -rf $BUILD_DIR
    
    # Build all packages
    npm run build
    
    log_info "Application built successfully"
}

# Database migrations
run_migrations() {
    log_info "Running database migrations..."
    
    # Check if migration script exists
    if [ -f "packages/backend/src/database/migrator.ts" ]; then
        cd packages/backend
        npm run migrate
        cd ../..
        log_info "Database migrations completed"
    else
        log_warn "No migration script found, skipping..."
    fi
}

# Health check
health_check() {
    log_info "Performing health check..."
    
    local max_attempts=30
    local attempt=1
    local health_url="${API_BASE_URL:-http://localhost:3001}/health"
    
    while [ $attempt -le $max_attempts ]; do
        if curl -f -s "$health_url" > /dev/null; then
            log_info "Health check passed"
            return 0
        fi
        
        log_warn "Health check attempt $attempt/$max_attempts failed, retrying in 10s..."
        sleep 10
        ((attempt++))
    done
    
    log_error "Health check failed after $max_attempts attempts"
    return 1
}

# Rollback function
rollback() {
    log_warn "Rolling back deployment..."
    
    if [ -d "$BACKUP_DIR/$BUILD_DIR" ]; then
        rm -rf "$BUILD_DIR"
        cp -r "$BACKUP_DIR/$BUILD_DIR" .
        log_info "Rollback completed"
    else
        log_error "No backup found for rollback"
        exit 1
    fi
}

# Main deployment process
main() {
    log_info "Starting deployment to $DEPLOY_ENV environment"
    
    # Trap errors and rollback
    trap 'log_error "Deployment failed, initiating rollback..."; rollback; exit 1' ERR
    
    check_prerequisites
    load_environment
    create_backup
    install_dependencies
    run_tests
    build_application
    run_migrations
    
    log_info "🎉 Deployment completed successfully!"
    
    # Optional health check
    if [ "$SKIP_HEALTH_CHECK" != "true" ]; then
        health_check
    fi
    
    log_info "✅ EcBot is ready for production!"
}

# Script execution
if [ "${BASH_SOURCE[0]}" == "${0}" ]; then
    main "$@"
fi