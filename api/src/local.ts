/**
 * Local development server using Express
 * Simulates API Gateway for local testing
 */

// Load environment variables first, before any other imports
import 'dotenv/config';

import express, { Request, Response, NextFunction } from 'express';
import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';

// Import handlers
import * as tenants from './handlers/tenants';
import * as credentials from './handlers/credentials';
import * as products from './handlers/products';
import * as entitlements from './handlers/entitlements';
import * as plans from './handlers/plans';
import * as checkout from './handlers/checkout';
import * as subscriptions from './handlers/subscriptions';
import * as webhooks from './handlers/webhooks';

const app = express();
const PORT = process.env.PORT || 3001;

// Raw body for webhook signature verification
app.use('/webhooks', express.raw({ type: 'application/json' }));

// JSON for everything else
app.use(express.json());

// CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Api-Key');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Helper to convert Express request to Lambda event
function toLambdaEvent(req: Request): APIGatewayProxyEvent {
  const isRawBody = Buffer.isBuffer(req.body);
  return {
    body: isRawBody ? req.body.toString() : JSON.stringify(req.body),
    headers: req.headers as Record<string, string>,
    httpMethod: req.method,
    path: req.path,
    pathParameters: req.params,
    queryStringParameters: req.query as Record<string, string>,
    requestContext: {} as APIGatewayProxyEvent['requestContext'],
    resource: '',
    stageVariables: null,
    isBase64Encoded: false,
    multiValueHeaders: {},
    multiValueQueryStringParameters: null,
  };
}

// Helper to create mock Lambda context
function createContext(): Context {
  return {
    callbackWaitsForEmptyEventLoop: false,
    functionName: 'local',
    functionVersion: '1',
    invokedFunctionArn: 'arn:aws:lambda:local:000000000000:function:local',
    memoryLimitInMB: '256',
    awsRequestId: 'local-request-id',
    logGroupName: '/aws/lambda/local',
    logStreamName: 'local-stream',
    getRemainingTimeInMillis: () => 30000,
    done: () => {},
    fail: () => {},
    succeed: () => {},
  };
}

// Handler wrapper
type LambdaHandler = (
  event: APIGatewayProxyEvent,
  context: Context
) => Promise<APIGatewayProxyResult>;

function wrapHandler(handler: LambdaHandler) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const event = toLambdaEvent(req);
      const context = createContext();
      const result = await handler(event, context);
      res.status(result.statusCode).set(result.headers).send(result.body);
    } catch (error) {
      next(error);
    }
  };
}

// ==================== ROUTES ====================

// Tenants
app.post('/tenants', wrapHandler(tenants.createHandler));
app.get('/tenants/:tenantId', wrapHandler(tenants.getHandler));
app.put('/tenants/:tenantId', wrapHandler(tenants.updateHandler));
app.delete('/tenants/:tenantId', wrapHandler(tenants.deleteHandler));

// Credentials (BYOC)
app.post('/tenants/:tenantId/credentials', wrapHandler(credentials.setHandler));
app.get('/tenants/:tenantId/credentials', wrapHandler(credentials.getStatusHandler));
app.delete('/tenants/:tenantId/credentials', wrapHandler(credentials.deleteHandler));

// Products
app.post('/tenants/:tenantId/products', wrapHandler(products.createHandler));
app.get('/tenants/:tenantId/products', wrapHandler(products.listHandler));
app.get('/tenants/:tenantId/products/:productId', wrapHandler(products.getHandler));
app.put('/tenants/:tenantId/products/:productId', wrapHandler(products.updateHandler));
app.delete('/tenants/:tenantId/products/:productId', wrapHandler(products.deleteHandler));

// Entitlements
app.post('/entitlements/check', wrapHandler(entitlements.checkHandler));

// Plans
app.get('/plans', wrapHandler(plans.handler));

// Checkout
app.post('/checkout/setup-intent', wrapHandler(checkout.createSetupIntentHandler));

// Subscriptions
app.post('/subscriptions/finalize', wrapHandler(subscriptions.finalizeHandler));
app.post('/subscriptions/cancel', wrapHandler(subscriptions.cancelHandler));
app.get('/subscriptions', wrapHandler(subscriptions.listHandler));

// Webhooks
app.post('/webhooks/stripe/:tenantId', wrapHandler(webhooks.handler));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handler
app.use((error: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Server error:', error);
  res.status(500).json({ success: false, error: error.message });
});

// Start server
app.listen(PORT, () => {
  console.log(`
+===============================================================+
|           Paywall-as-a-Service - Local Dev Server             |
+===============================================================+
|  Server running at http://localhost:${PORT}                        |
|                                                               |
|  Tenant Management:                                           |
|    POST   /tenants                                            |
|    GET    /tenants/:tenantId                                  |
|    PUT    /tenants/:tenantId                                  |
|    DELETE /tenants/:tenantId                                  |
|                                                               |
|  Credentials (BYOC):                                          |
|    POST   /tenants/:tenantId/credentials                      |
|    GET    /tenants/:tenantId/credentials                      |
|    DELETE /tenants/:tenantId/credentials                      |
|                                                               |
|  Products:                                                    |
|    POST   /tenants/:tenantId/products                         |
|    GET    /tenants/:tenantId/products                         |
|    GET    /tenants/:tenantId/products/:productId              |
|    PUT    /tenants/:tenantId/products/:productId              |
|    DELETE /tenants/:tenantId/products/:productId              |
|                                                               |
|  Entitlements:                                                |
|    POST   /entitlements/check                                 |
|                                                               |
|  Plans / Checkout / Subscriptions:                            |
|    GET    /plans                                              |
|    POST   /checkout/setup-intent                              |
|    POST   /subscriptions/finalize                             |
|    POST   /subscriptions/cancel                               |
|    GET    /subscriptions                                      |
|                                                               |
|  Webhooks:                                                    |
|    POST   /webhooks/stripe/:tenantId                          |
|                                                               |
|  Health:                                                      |
|    GET    /health                                             |
+===============================================================+
  `);
});
