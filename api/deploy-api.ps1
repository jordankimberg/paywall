# PowerShell script to deploy Paywall API to AWS Lambda via Serverless Framework
# Usage: .\deploy-api.ps1
#
# Prerequisites:
# 1. Node.js and npm installed
# 2. Serverless Framework installed (npm install -g serverless)
# 3. AWS credentials configured

$ErrorActionPreference = "Stop"

# Use full path to AWS CLI (works in VS Code terminal)
$aws = "C:\Program Files\Amazon\AWSCLIV2\aws.exe"

Write-Host "Deploying Paywall API" -ForegroundColor Cyan
Write-Host "=====================" -ForegroundColor Cyan

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

# Check Node.js
Write-Host ""
Write-Host "Checking Node.js..." -ForegroundColor Yellow
try {
    $nodeVersion = node --version 2>&1
    Write-Host "Node.js: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "ERROR: Node.js not found" -ForegroundColor Red
    exit 1
}

# Check Serverless Framework
Write-Host ""
Write-Host "Checking Serverless Framework..." -ForegroundColor Yellow
try {
    $slsVersion = npx serverless --version 2>&1
    Write-Host "Serverless: $slsVersion" -ForegroundColor Green
} catch {
    Write-Host "ERROR: Serverless Framework not found" -ForegroundColor Red
    Write-Host "Install with: npm install -g serverless" -ForegroundColor Yellow
    exit 1
}

# Install dependencies if needed
Write-Host ""
Write-Host "Checking dependencies..." -ForegroundColor Yellow
Push-Location $PSScriptRoot
if (-not (Test-Path "node_modules")) {
    Write-Host "Installing dependencies..." -ForegroundColor Yellow
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: npm install failed!" -ForegroundColor Red
        Pop-Location
        exit 1
    }
}
Write-Host "Dependencies ready!" -ForegroundColor Green

# Deploy using Serverless Framework
Write-Host ""
Write-Host "Deploying to AWS..." -ForegroundColor Yellow
Write-Host "(This may take a few minutes)" -ForegroundColor Gray
Write-Host ""

npx serverless deploy --stage dev

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "ERROR: Deployment failed!" -ForegroundColor Red
    Pop-Location
    exit 1
}

Pop-Location

Write-Host ""
Write-Host "=====================" -ForegroundColor Green
Write-Host "Deployment complete!" -ForegroundColor Green
Write-Host "API URL: https://pay-api.agentbrigade.ai" -ForegroundColor Cyan
Write-Host "=====================" -ForegroundColor Green
