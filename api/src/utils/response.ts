import { APIGatewayProxyResult } from 'aws-lambda';

const corsHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Api-Key',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
};

export function json(statusCode: number, body: unknown): APIGatewayProxyResult {
  return {
    statusCode,
    headers: corsHeaders,
    body: JSON.stringify(body),
  };
}

export function success<T>(data: T, statusCode = 200): APIGatewayProxyResult {
  return json(statusCode, { success: true, data });
}

export function error(message: string, statusCode = 400): APIGatewayProxyResult {
  return json(statusCode, { success: false, error: message });
}
