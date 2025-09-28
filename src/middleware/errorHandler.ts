import { Request, Response, NextFunction } from 'express';
import { APIResponse } from '../types';
import { 
  AppError, 
  ValidationError, 
  FoodNotFoundError, 
  NetworkError, 
  USDAAPIError, 
  ParsingError, 
  RateLimitError, 
  InternalServerError,
  ErrorCode 
} from '../types/errors';

// Generate unique request ID for tracking
const generateRequestId = (): string => {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

export const asyncHandler = (fn: Function) => (req: Request, res: Response, next: NextFunction) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

export const errorHandler = (err: Error, req: Request, res: Response, next: NextFunction): void => {
  // Generate request ID if not present
  const requestId = (req as any).requestId || generateRequestId();
  
  // Log error with context
  console.error('Error Details:', {
    requestId,
    method: req.method,
    path: req.path,
    query: req.query,
    body: req.body,
    error: {
      name: err.name,
      message: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    },
    timestamp: new Date().toISOString()
  });

  let appError: AppError;

  // Handle different types of errors
  if (err instanceof AppError) {
    appError = err;
  } else if (err.name === 'ValidationError') {
    appError = new ValidationError(err.message, undefined, requestId, req.path, req.method);
  } else if (err.message.includes('not found') || err.message.includes('Not Found')) {
    appError = new FoodNotFoundError(undefined, undefined, requestId, req.path, req.method);
  } else if (err.message.includes('Invalid or missing API key') || err.message.includes('API key')) {
    appError = new AppError(err.message, 401, ErrorCode.API_KEY_INVALID, undefined, requestId, req.path, req.method);
  } else if (err.message.includes('API access forbidden') || err.message.includes('Forbidden')) {
    appError = new AppError(err.message, 403, ErrorCode.FORBIDDEN, undefined, requestId, req.path, req.method);
  } else if (err.message.includes('rate limit') || err.message.includes('Rate limit')) {
    appError = new RateLimitError(100, 0, new Date(), requestId, req.path, req.method);
  } else if (err.message.includes('ECONNREFUSED') || err.message.includes('ENOTFOUND') || err.message.includes('ETIMEDOUT')) {
    appError = new NetworkError('USDA API', err, requestId, req.path, req.method);
  } else if (err.message.includes('timeout')) {
    appError = new AppError('Request timeout', 408, ErrorCode.USDA_API_TIMEOUT, undefined, requestId, req.path, req.method);
  } else if (err.message.includes('JSON') || err.message.includes('parsing') || err.message.includes('syntax')) {
    appError = new ParsingError('Failed to parse response data', undefined, requestId, req.path, req.method);
  } else {
    // Unknown error
    appError = new InternalServerError(
      process.env.NODE_ENV === 'development' ? err.message : 'An unexpected error occurred',
      err,
      requestId,
      req.path,
      req.method
    );
  }

  // Add request ID to response headers
  res.set('X-Request-ID', requestId);

  // Send error response
  const response = appError.toAPIResponse();
  res.status(appError.statusCode).json(response);
};

export const notFoundHandler = (req: Request, res: Response): void => {
  const requestId = (req as any).requestId || generateRequestId();
  
  const response: APIResponse<null> = {
    success: false,
    error: ErrorCode.ENDPOINT_NOT_FOUND,
    message: `Route ${req.method} ${req.path} not found`,
    data: null,
    requestId
  };

  res.set('X-Request-ID', requestId);
  res.status(404).json(response);
};

// Middleware to add request ID to all requests
export const requestIdMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  (req as any).requestId = generateRequestId();
  res.set('X-Request-ID', (req as any).requestId);
  next();
};