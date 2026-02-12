# PowerShell script to deploy Paywall Checkout Frontend to AWS S3/CloudFront
# Usage: .\deploy-checkout.ps1
#
# Prerequisites:
# 1. S3 bucket: paywall-checkout-dev (created by serverless.yml)
# 2. CloudFront distribution (created by serverless.yml)
# 3. AWS credentials configured

$ErrorActionPreference = "Stop"

# Configuration
$S3_BUCKET = "paywall-checkout-dev"
$DISTRIBUTION_ID = "E174VOBZX7OZFM"

# Use full path to AWS CLI (works in VS Code terminal)
$aws = "C:\Program Files\Amazon\AWSCLIV2\aws.exe"

Write-Host "Deploying Paywall Checkout Frontend" -ForegroundColor Cyan
Write-Host "====================================" -ForegroundColor Cyan

# Check AWS CLI
Write-Host ""
Write-Host "Checking AWS CLI..." -ForegroundColor Yellow
if (-not (Test-Path $aws)) {
    Write-Host "ERROR: AWS CLI not found at $aws" -ForegroundColor Red
    exit 1
}
try {
    $awsVersion = & $aws --version 2>&1
    Write-Host "AWS CLI: $awsVersion" -ForegroundColor Green
} catch {
    Write-Host "ERROR: AWS CLI not working" -ForegroundColor Red
    exit 1
}

# Check AWS credentials
Write-Host ""
Write-Host "Checking AWS credentials..." -ForegroundColor Yellow
try {
    $identity = & $aws sts get-caller-identity --output json 2>&1 | ConvertFrom-Json
    Write-Host "Authenticated as: $($identity.Arn)" -ForegroundColor Green
} catch {
    Write-Host "ERROR: AWS credentials not configured" -ForegroundColor Red
    exit 1
}

# Build the checkout frontend
Write-Host ""
Write-Host "Building checkout frontend..." -ForegroundColor Yellow
Push-Location $PSScriptRoot
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Build failed!" -ForegroundColor Red
    Pop-Location
    exit 1
}
Write-Host "Build complete!" -ForegroundColor Green
Pop-Location

# Sync dist folder to S3
Write-Host ""
Write-Host "Uploading to S3..." -ForegroundColor Yellow

& $aws s3 sync "$PSScriptRoot\dist" "s3://$S3_BUCKET/" `
    --delete `
    --cache-control "no-cache, must-revalidate"

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: S3 sync failed!" -ForegroundColor Red
    exit 1
}
Write-Host "Uploaded to s3://$S3_BUCKET/" -ForegroundColor Green

# Set proper cache headers and MIME types for assets
Write-Host "Setting cache headers for JS files..." -ForegroundColor Yellow
& $aws s3 cp "s3://$S3_BUCKET/assets/" "s3://$S3_BUCKET/assets/" `
    --recursive `
    --exclude "*" `
    --include "*.js" `
    --content-type "application/javascript" `
    --cache-control "public, max-age=31536000" `
    --metadata-directive REPLACE

Write-Host "Setting cache headers for CSS files..." -ForegroundColor Yellow
& $aws s3 cp "s3://$S3_BUCKET/assets/" "s3://$S3_BUCKET/assets/" `
    --recursive `
    --exclude "*" `
    --include "*.css" `
    --content-type "text/css" `
    --cache-control "public, max-age=31536000" `
    --metadata-directive REPLACE

# Invalidate CloudFront cache
Write-Host ""
Write-Host "Invalidating CloudFront cache..." -ForegroundColor Yellow
$invalidationResult = & $aws cloudfront create-invalidation --distribution-id $DISTRIBUTION_ID --paths "/*" --output json 2>&1
$invalidation = $invalidationResult | ConvertFrom-Json
$invalidationId = $invalidation.Invalidation.Id
Write-Host "Invalidation created: $invalidationId" -ForegroundColor Green

# Wait for invalidation to complete
Write-Host "Waiting for invalidation to complete..." -ForegroundColor Yellow
$maxAttempts = 60
$attempt = 0
do {
    Start-Sleep -Seconds 5
    $attempt++
    $statusResult = & $aws cloudfront get-invalidation --distribution-id $DISTRIBUTION_ID --id $invalidationId --output json 2>&1
    $status = ($statusResult | ConvertFrom-Json).Invalidation.Status
    Write-Host "  Status: $status (attempt $attempt/$maxAttempts)" -ForegroundColor Gray
} while ($status -ne "Completed" -and $attempt -lt $maxAttempts)

if ($status -eq "Completed") {
    Write-Host "Invalidation completed!" -ForegroundColor Green
} else {
    Write-Host "WARNING: Invalidation still in progress" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "====================================" -ForegroundColor Green
Write-Host "Deployment complete!" -ForegroundColor Green
Write-Host "Checkout URL: https://pay.agentbrigade.ai" -ForegroundColor Cyan
Write-Host "====================================" -ForegroundColor Green
