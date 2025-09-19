# EcBot Production Deployment Script for Windows
param(
    [string]$Environment = "production",
    [switch]$SkipHealthCheck = $false
)

# Configuration
$BuildDir = "dist"
$BackupDir = "backups\$(Get-Date -Format 'yyyyMMdd_HHmmss')"

# Colors for output
$Colors = @{
    Red = "Red"
    Green = "Green"
    Yellow = "Yellow"
}

function Write-Log {
    param(
        [string]$Message,
        [string]$Level = "INFO"
    )
    
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $color = switch ($Level) {
        "ERROR" { $Colors.Red }
        "WARN" { $Colors.Yellow }
        default { $Colors.Green }
    }
    
    Write-Host "[$timestamp] [$Level] $Message" -ForegroundColor $color
}

function Test-Prerequisites {
    Write-Log "Checking prerequisites..."
    
    # Check if Node.js is installed
    try {
        $nodeVersion = node --version
        Write-Log "Node.js version: $nodeVersion"
    }
    catch {
        Write-Log "Node.js is not installed" "ERROR"
        exit 1
    }
    
    # Check if npm is installed
    try {
        $npmVersion = npm --version
        Write-Log "npm version: $npmVersion"
    }
    catch {
        Write-Log "npm is not installed" "ERROR"
        exit 1
    }
    
    Write-Log "Prerequisites check passed"
}

function Import-Environment {
    Write-Log "Loading environment variables for $Environment..."
    
    $envFile = ".env.$Environment"
    if (-not (Test-Path $envFile)) {
        $envFile = ".env"
        if (-not (Test-Path $envFile)) {
            Write-Log "No environment file found" "ERROR"
            exit 1
        }
        Write-Log "Using default .env file" "WARN"
    }
    
    Get-Content $envFile | ForEach-Object {
        if ($_ -match '^([^#][^=]+)=(.*)$') {
            [Environment]::SetEnvironmentVariable($matches[1], $matches[2], "Process")
        }
    }
    
    Write-Log "Environment variables loaded from $envFile"
}

function New-Backup {
    if (Test-Path $BuildDir) {
        Write-Log "Creating backup..."
        New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
        Copy-Item -Path $BuildDir -Destination $BackupDir -Recurse
        Write-Log "Backup created at $BackupDir"
    }
}

function Install-Dependencies {
    Write-Log "Installing dependencies..."
    npm ci --only=production
    if ($LASTEXITCODE -ne 0) {
        Write-Log "Failed to install dependencies" "ERROR"
        exit 1
    }
    Write-Log "Dependencies installed"
}

function Invoke-Tests {
    Write-Log "Running tests..."
    npm run test:ci
    if ($LASTEXITCODE -ne 0) {
        Write-Log "Tests failed" "ERROR"
        exit 1
    }
    Write-Log "All tests passed"
}

function Build-Application {
    Write-Log "Building application..."
    
    # Clean previous build
    if (Test-Path $BuildDir) {
        Remove-Item -Path $BuildDir -Recurse -Force
    }
    
    # Build all packages
    npm run build
    if ($LASTEXITCODE -ne 0) {
        Write-Log "Build failed" "ERROR"
        exit 1
    }
    
    Write-Log "Application built successfully"
}

function Invoke-Migrations {
    Write-Log "Running database migrations..."
    
    if (Test-Path "packages\backend\src\database\migrator.ts") {
        Push-Location "packages\backend"
        npm run migrate
        $migrationResult = $LASTEXITCODE
        Pop-Location
        
        if ($migrationResult -ne 0) {
            Write-Log "Database migrations failed" "ERROR"
            exit 1
        }
        Write-Log "Database migrations completed"
    }
    else {
        Write-Log "No migration script found, skipping..." "WARN"
    }
}

function Test-Health {
    Write-Log "Performing health check..."
    
    $maxAttempts = 30
    $attempt = 1
    $healthUrl = if ($env:API_BASE_URL) { "$env:API_BASE_URL/health" } else { "http://localhost:3001/health" }
    
    while ($attempt -le $maxAttempts) {
        try {
            $response = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 10
            if ($response.StatusCode -eq 200) {
                Write-Log "Health check passed"
                return $true
            }
        }
        catch {
            # Continue to retry
        }
        
        Write-Log "Health check attempt $attempt/$maxAttempts failed, retrying in 10s..." "WARN"
        Start-Sleep -Seconds 10
        $attempt++
    }
    
    Write-Log "Health check failed after $maxAttempts attempts" "ERROR"
    return $false
}

function Restore-Backup {
    Write-Log "Rolling back deployment..." "WARN"
    
    $backupBuildDir = Join-Path $BackupDir $BuildDir
    if (Test-Path $backupBuildDir) {
        if (Test-Path $BuildDir) {
            Remove-Item -Path $BuildDir -Recurse -Force
        }
        Copy-Item -Path $backupBuildDir -Destination . -Recurse
        Write-Log "Rollback completed"
    }
    else {
        Write-Log "No backup found for rollback" "ERROR"
        exit 1
    }
}

# Main deployment process
function Start-Deployment {
    Write-Log "Starting deployment to $Environment environment"
    
    try {
        Test-Prerequisites
        Import-Environment
        New-Backup
        Install-Dependencies
        Invoke-Tests
        Build-Application
        Invoke-Migrations
        
        Write-Log "🎉 Deployment completed successfully!"
        
        # Optional health check
        if (-not $SkipHealthCheck) {
            if (-not (Test-Health)) {
                throw "Health check failed"
            }
        }
        
        Write-Log "✅ EcBot is ready for production!"
    }
    catch {
        Write-Log "Deployment failed: $($_.Exception.Message)" "ERROR"
        Write-Log "Initiating rollback..." "WARN"
        Restore-Backup
        exit 1
    }
}

# Execute deployment
Start-Deployment