import { APIResponse } from './index';

export enum ErrorCode {
  // Validation errors (400)
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  INVALID_FOOD_TYPE = 'INVALID_FOOD_TYPE',
  INVALID_PAGE_SIZE = 'INVALID_PAGE_SIZE',
  INVALID_PAGE_NUMBER = 'INVALID_PAGE_NUMBER',
  INVALID_FDC_ID = 'INVALID_FDC_ID',
  
  // Authentication/Authorization errors (401/403)
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  API_KEY_INVALID = 'API_KEY_INVALID',
  API_KEY_MISSING = 'API_KEY_MISSING',
  
  // Not found errors (404)
  FOOD_NOT_FOUND = 'FOOD_NOT_FOUND',
  ENDPOINT_NOT_FOUND = 'ENDPOINT_NOT_FOUND',
  
  // Rate limiting (429)
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  
  // Network/External service errors (502/503)
  NETWORK_ERROR = 'NETWORK_ERROR',
  EXTERNAL_SERVICE_ERROR = 'EXTERNAL_SERVICE_ERROR',
  USDA_API_ERROR = 'USDA_API_ERROR',
  USDA_API_TIMEOUT = 'USDA_API_TIMEOUT',
  USDA_API_UNAVAILABLE = 'USDA_API_UNAVAILABLE',
  
  // Parsing/Data errors (422)
  PARSING_ERROR = 'PARSING_ERROR',
  INVALID_RESPONSE_FORMAT = 'INVALID_RESPONSE_FORMAT',
  NUTRITION_DATA_MISSING = 'NUTRITION_DATA_MISSING',
  
  // Server errors (500)
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
  DATABASE_ERROR = 'DATABASE_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}

export interface ErrorDetails {
  code: ErrorCode;
  message: string;
  details?: any;
  timestamp: string;
  requestId?: string;
  path?: string;
  method?: string;
}

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: ErrorCode;
  public readonly details?: any;
  public readonly timestamp: string;
  public readonly requestId?: string;
  public readonly path?: string;
  public readonly method?: string;

  constructor(
    message: string,
    statusCode: number = 500,
    code: ErrorCode = ErrorCode.UNKNOWN_ERROR,
    details?: any,
    requestId?: string,
    path?: string,
    method?: string
  ) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.timestamp = new Date().toISOString();
    this.requestId = requestId;
    this.path = path;
    this.method = method;

    // Maintains proper stack trace for where our error was thrown
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON(): ErrorDetails {
    return {
      code: this.code,
      message: this.message,
      details: this.details,
      timestamp: this.timestamp,
      requestId: this.requestId,
      path: this.path,
      method: this.method
    };
  }

  toAPIResponse(): APIResponse<null> {
    return {
      success: false,
      error: this.code,
      message: this.message,
      data: null,
      ...(this.details && { details: this.details }),
      ...(this.requestId && { requestId: this.requestId })
    };
  }
}

// Specific error classes
export class ValidationError extends AppError {
  constructor(message: string, details?: any, requestId?: string, path?: string, method?: string) {
    super(message, 400, ErrorCode.VALIDATION_ERROR, details, requestId, path, method);
  }
}

export class FoodNotFoundError extends AppError {
  constructor(foodType?: string, fdcId?: number, requestId?: string, path?: string, method?: string) {
    const message = fdcId 
      ? `Food with FDC ID ${fdcId} not found`
      : `No foods found for type: ${foodType || 'unknown'}`;
    super(message, 404, ErrorCode.FOOD_NOT_FOUND, { foodType, fdcId }, requestId, path, method);
  }
}

export class NetworkError extends AppError {
  constructor(service: string, originalError?: any, requestId?: string, path?: string, method?: string) {
    const message = `Network error connecting to ${service}`;
    super(message, 502, ErrorCode.NETWORK_ERROR, { service, originalError: originalError?.message }, requestId, path, method);
  }
}

export class USDAAPIError extends AppError {
  constructor(statusCode: number, message: string, originalError?: any, requestId?: string, path?: string, method?: string) {
    let errorCode = ErrorCode.USDA_API_ERROR;
    let httpStatus = 502;

    switch (statusCode) {
      case 400:
        errorCode = ErrorCode.VALIDATION_ERROR;
        httpStatus = 400;
        break;
      case 401:
        errorCode = ErrorCode.API_KEY_INVALID;
        httpStatus = 401;
        break;
      case 403:
        errorCode = ErrorCode.FORBIDDEN;
        httpStatus = 403;
        break;
      case 404:
        errorCode = ErrorCode.FOOD_NOT_FOUND;
        httpStatus = 404;
        break;
      case 429:
        errorCode = ErrorCode.RATE_LIMIT_EXCEEDED;
        httpStatus = 429;
        break;
      case 500:
      case 502:
      case 503:
        errorCode = ErrorCode.USDA_API_UNAVAILABLE;
        httpStatus = 503;
        break;
    }

    super(message, httpStatus, errorCode, { 
      usdaStatusCode: statusCode, 
      originalError: originalError?.message 
    }, requestId, path, method);
  }
}

export class ParsingError extends AppError {
  constructor(message: string, data?: any, requestId?: string, path?: string, method?: string) {
    super(message, 422, ErrorCode.PARSING_ERROR, { data }, requestId, path, method);
  }
}

export class RateLimitError extends AppError {
  constructor(limit: number, remaining: number, resetTime: Date, requestId?: string, path?: string, method?: string) {
    const message = `Rate limit exceeded. ${remaining} requests remaining. Reset at ${resetTime.toISOString()}`;
    super(message, 429, ErrorCode.RATE_LIMIT_EXCEEDED, { 
      limit, 
      remaining, 
      resetTime: resetTime.toISOString() 
    }, requestId, path, method);
  }
}

export class InternalServerError extends AppError {
  constructor(message: string, originalError?: any, requestId?: string, path?: string, method?: string) {
    super(message, 500, ErrorCode.INTERNAL_SERVER_ERROR, { 
      originalError: originalError?.message 
    }, requestId, path, method);
  }
}
