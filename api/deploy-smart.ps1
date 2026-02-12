# PowerShell script for intelligent incremental Lambda deployment
# Usage:
#   .\deploy-smart.ps1           # Smart incremental deploy (only changed functions)
#   .\deploy-smart.ps1 -Full     # Full deployment (all infrastructure + functions)
#   .\deploy-smart.ps1 -Force    # Force deploy all functions without infrastructure
#
# How it works:
# - Tracks last deployment timestamp in .last-deploy file
# - Detects which handler files have changed since last deploy
# - Only deploys functions whose code has changed
# - Falls back to full deploy if serverless.yml or shared code changes

param(
    [switch]$Full,
    [switch]$Force,
    [string]$Stage = "dev"
)

$ErrorActionPreference = "Stop"

# Configuration
$LAST_DEPLOY_FILE = ".last-deploy"
$aws = "C:\Program Files\Amazon\AWSCLIV2\aws.exe"

# Map function names to their handler files
$FUNCTION_HANDLERS = @{
    # Tenants
    "createTenant" = "src/handlers/tenants.ts"
    "getTenant" = "src/handlers/tenants.ts"
    "updateTenant" = "src/handlers/tenants.ts"
    "deleteTenant" = "src/handlers/tenants.ts"

    # Credentials
    "setCredentials" = "src/handlers/credentials.ts"
    "getCredentialsStatus" = "src/handlers/credentials.ts"
    "deleteCredentials" = "src/handlers/credentials.ts"

    # Products
    "createProduct" = "src/handlers/products.ts"
    "listProducts" = "src/handlers/products.ts"
    "getProduct" = "src/handlers/products.ts"
    "updateProduct" = "src/handlers/products.ts"
    "deleteProduct" = "src/handlers/products.ts"

    # Entitlements
    "checkEntitlement" = "src/handlers/entitlements.ts"

    # Plans
    "getPlans" = "src/handlers/plans.ts"

    # Checkout
    "createSetupIntent" = "src/handlers/checkout.ts"

    # Subscriptions
    "finalizeSubscription" = "src/handlers/subscriptions.ts"
    "cancelSubscription" = "src/handlers/subscriptions.ts"
    "listSubscriptions" = "src/handlers/subscriptions.ts"

    # Webhooks
    "stripeWebhook" = "src/handlers/webhooks.ts"
}

# Shared files that affect all functions
$SHARED_FILES = @(
    "src/services/dynamodb.ts"
    "src/services/stripe.ts"
    "src/services/credentials.ts"
    "src/services/entitlements.ts"
    "src/middleware/auth.ts"
    "src/utils/apiKey.ts"
    "src/utils/response.ts"
    "src/types/index.ts"
)

# Infrastructure files that require full deploy
$INFRA_FILES = @(
    "serverless.yml"
    "package.json"
    "tsconfig.json"
)

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Paywall Smart Deploy" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Verify we're in the right directory
Push-Location $PSScriptRoot

# Check prerequisites
Write-Host "Checking prerequisites..." -ForegroundColor Yellow

if (-not (Test-Path $aws)) {
    Write-Host "ERROR: AWS CLI not found" -ForegroundColor Red
    Pop-Location
    exit 1
}

try {
    $identity = & $aws sts get-caller-identity --output json 2>&1 | ConvertFrom-Json
    Write-Host "  AWS: $($identity.Arn)" -ForegroundColor Green
} catch {
    Write-Host "ERROR: AWS credentials not configured" -ForegroundColor Red
    Pop-Location
    exit 1
}

# Check if full deploy is needed
if ($Full) {
    Write-Host ""
    Write-Host "Full deployment requested (-Full flag)" -ForegroundColor Yellow
    Write-Host ""
    cmd /c "npx serverless deploy --stage $Stage"
    $exitCode = $LASTEXITCODE

    if ($exitCode -eq 0) {
        Get-Date -Format "o" | Out-File -FilePath $LAST_DEPLOY_FILE -Encoding UTF8
        Write-Host ""
        Write-Host "Full deployment complete!" -ForegroundColor Green
    } else {
        Write-Host "ERROR: Deployment failed!" -ForegroundColor Red
        Pop-Location
        exit 1
    }
    Pop-Location
    exit 0
}

# Get last deploy time
$lastDeployTime = $null
if (Test-Path $LAST_DEPLOY_FILE) {
    $lastDeployStr = Get-Content $LAST_DEPLOY_FILE -Raw
    $lastDeployTime = [DateTime]::Parse($lastDeployStr.Trim())
    Write-Host "  Last deploy: $($lastDeployTime.ToString('g'))" -ForegroundColor Gray
} else {
    Write-Host "  Last deploy: Never (will do full deploy)" -ForegroundColor Yellow
}

# Check for infrastructure changes
$infraChanged = $false
if ($lastDeployTime) {
    foreach ($file in $INFRA_FILES) {
        if (Test-Path $file) {
            $fileTime = (Get-Item $file).LastWriteTime
            if ($fileTime -gt $lastDeployTime) {
                Write-Host "  Infrastructure change detected: $file" -ForegroundColor Yellow
                $infraChanged = $true
                break
            }
        }
    }
}

# If infrastructure changed or never deployed, do full deploy
if (-not $lastDeployTime -or $infraChanged) {
    Write-Host ""
    if ($infraChanged) {
        Write-Host "Infrastructure changes detected - performing full deployment" -ForegroundColor Yellow
    } else {
        Write-Host "No previous deployment found - performing full deployment" -ForegroundColor Yellow
    }
    Write-Host ""

    cmd /c "npx serverless deploy --stage $Stage"
    $exitCode = $LASTEXITCODE

    if ($exitCode -eq 0) {
        Get-Date -Format "o" | Out-File -FilePath $LAST_DEPLOY_FILE -Encoding UTF8
        Write-Host ""
        Write-Host "Full deployment complete!" -ForegroundColor Green
    } else {
        Write-Host "ERROR: Deployment failed!" -ForegroundColor Red
        Pop-Location
        exit 1
    }
    Pop-Location
    exit 0
}

# Check for shared file changes
$sharedChanged = $false
foreach ($file in $SHARED_FILES) {
    if (Test-Path $file) {
        $fileTime = (Get-Item $file).LastWriteTime
        if ($fileTime -gt $lastDeployTime) {
            Write-Host "  Shared file changed: $file" -ForegroundColor Yellow
            $sharedChanged = $true
        }
    }
}

# Find changed handler files
$changedHandlers = @{}
foreach ($func in $FUNCTION_HANDLERS.Keys) {
    $handlerFile = $FUNCTION_HANDLERS[$func]
    if (Test-Path $handlerFile) {
        $fileTime = (Get-Item $handlerFile).LastWriteTime
        if ($fileTime -gt $lastDeployTime) {
            if (-not $changedHandlers.ContainsKey($handlerFile)) {
                $changedHandlers[$handlerFile] = @()
            }
            $changedHandlers[$handlerFile] += $func
        }
    }
}

# Determine functions to deploy
$functionsToUpdate = @()

if ($Force) {
    $functionsToUpdate = $FUNCTION_HANDLERS.Keys
    Write-Host ""
    Write-Host "Force mode: deploying all functions" -ForegroundColor Yellow
} elseif ($sharedChanged) {
    $functionsToUpdate = $FUNCTION_HANDLERS.Keys
    Write-Host ""
    Write-Host "Shared code changed - updating all functions" -ForegroundColor Yellow
} else {
    foreach ($handlerFile in $changedHandlers.Keys) {
        $functionsToUpdate += $changedHandlers[$handlerFile]
    }
}

# Remove duplicates
$functionsToUpdate = $functionsToUpdate | Select-Object -Unique

if ($functionsToUpdate.Count -eq 0) {
    Write-Host ""
    Write-Host "No changes detected since last deployment!" -ForegroundColor Green
    Write-Host "Use -Force to deploy all functions anyway, or -Full for infrastructure changes." -ForegroundColor Gray
    Pop-Location
    exit 0
}

Write-Host ""
Write-Host "Deploying $($functionsToUpdate.Count) function(s):" -ForegroundColor Cyan
foreach ($func in $functionsToUpdate) {
    Write-Host "  - $func" -ForegroundColor Gray
}
Write-Host ""

# Deploy each function
$successCount = 0
$failCount = 0
$startTime = Get-Date

foreach ($func in $functionsToUpdate) {
    Write-Host "Deploying $func..." -ForegroundColor Yellow

    $handlerFile = $FUNCTION_HANDLERS[$func]
    if (-not (Test-Path $handlerFile)) {
        Write-Host "  Skipping (handler not found: $handlerFile)" -ForegroundColor DarkYellow
        continue
    }

    $output = cmd /c "npx serverless deploy function -f $func --stage $Stage 2>&1"
    $exitCode = $LASTEXITCODE

    if ($exitCode -eq 0) {
        Write-Host "  Done!" -ForegroundColor Green
        $successCount++
    } else {
        Write-Host "  FAILED!" -ForegroundColor Red
        Write-Host $output -ForegroundColor DarkRed
        $failCount++
    }
}

$elapsed = (Get-Date) - $startTime

# Update last deploy timestamp
Get-Date -Format "o" | Out-File -FilePath $LAST_DEPLOY_FILE -Encoding UTF8

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Deployment Summary" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Successful: $successCount" -ForegroundColor Green
if ($failCount -gt 0) {
    Write-Host "  Failed: $failCount" -ForegroundColor Red
}
Write-Host "  Time: $($elapsed.ToString('mm\:ss'))" -ForegroundColor Gray
Write-Host "  API URL: https://pay-api.agentbrigade.ai" -ForegroundColor Cyan
Write-Host ""

Pop-Location

if ($failCount -gt 0) {
    exit 1
}
