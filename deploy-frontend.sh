#!/bin/bash
# Deploy the checkout frontend to S3 + invalidate CloudFront
# Usage: ./deploy-frontend.sh [stage]

STAGE=${1:-dev}
BUCKET="paywall-checkout-${STAGE}"

echo "Building frontend..."
cd app && npm run build

echo "Syncing to S3 bucket: ${BUCKET}..."
aws s3 sync dist/ "s3://${BUCKET}" --delete

echo "Invalidating CloudFront cache..."
DISTRIBUTION_ID=$(aws cloudformation describe-stacks \
  --stack-name "paywall-${STAGE}" \
  --query "Stacks[0].Outputs[?OutputKey=='CheckoutCloudFrontDomain'].OutputValue" \
  --output text 2>/dev/null)

if [ -n "$DISTRIBUTION_ID" ]; then
  # Get the distribution ID from the domain name
  CF_ID=$(aws cloudfront list-distributions \
    --query "DistributionList.Items[?DomainName=='${DISTRIBUTION_ID}'].Id" \
    --output text)
  if [ -n "$CF_ID" ]; then
    aws cloudfront create-invalidation --distribution-id "$CF_ID" --paths "/*"
    echo "CloudFront invalidation created for ${CF_ID}"
  fi
fi

echo "Frontend deployed to https://pay.agentbrigade.ai"
