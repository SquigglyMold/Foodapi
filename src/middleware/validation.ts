import { Request, Response, NextFunction } from 'express';
import { APIResponse } from '../types';
import { ValidationError, ErrorCode } from '../types/errors';
import xss from 'xss';

export interface ValidationErrorItem {
  field: string;
  message: string;
  value?: any;
}

export class ValidationErrorClass extends Error {
  public errors: ValidationErrorItem[];
  public statusCode: number = 400;

  constructor(errors: ValidationErrorItem[]) {
    super('Validation failed');
    this.name = 'ValidationError';
    this.errors = errors;
  }
}

// Pre-compile regex for better performance
const VALID_FOOD_TYPE_REGEX = /^[a-zA-Z0-9\s\-.,&()]+$/;

/**
 * Validate food search parameters
 * Optimized with early returns and pre-compiled regex
 */
export const validateFoodSearch = (req: Request, res: Response, next: NextFunction): void => {
  const errors: ValidationErrorItem[] = [];
  const { type, pageSize, pageNumber } = req.query;

  // Validate required 'type' parameter with early returns
  if (!type) {
    errors.push({
      field: 'type',
      message: 'Food type parameter is required'
    });
  } else if (typeof type !== 'string') {
    errors.push({
      field: 'type',
      message: 'Food type must be a string',
      value: type
    });
  } else {
    const trimmedType = type.trim();
    if (trimmedType.length === 0) {
      errors.push({
        field: 'type',
        message: 'Food type cannot be empty'
      });
    } else if (trimmedType.length > 100) {
      errors.push({
        field: 'type',
        message: 'Food type must be 100 characters or less',
        value: type
      });
    } else if (!VALID_FOOD_TYPE_REGEX.test(trimmedType)) {
      errors.push({
        field: 'type',
        message: 'Food type contains invalid characters. Only letters, numbers, spaces, and basic punctuation are allowed',
        value: type
      });
    }
  }

  // Validate optional 'pageSize' parameter
  if (pageSize !== undefined) {
    const pageSizeNum = parseInt(pageSize as string, 10);
    if (isNaN(pageSizeNum)) {
      errors.push({
        field: 'pageSize',
        message: 'Page size must be a valid number',
        value: pageSize
      });
    } else if (pageSizeNum < 1) {
      errors.push({
        field: 'pageSize',
        message: 'Page size must be at least 1',
        value: pageSizeNum
      });
    } else if (pageSizeNum > 200) {
      errors.push({
        field: 'pageSize',
        message: 'Page size cannot exceed 200',
        value: pageSizeNum
      });
    }
  }

  // Validate optional 'pageNumber' parameter
  if (pageNumber !== undefined) {
    const pageNumberNum = parseInt(pageNumber as string, 10);
    if (isNaN(pageNumberNum)) {
      errors.push({
        field: 'pageNumber',
        message: 'Page number must be a valid number',
        value: pageNumber
      });
    } else if (pageNumberNum < 1) {
      errors.push({
        field: 'pageNumber',
        message: 'Page number must be at least 1',
        value: pageNumberNum
      });
    }
  }

  if (errors.length > 0) {
    const requestId = (req as any).requestId;
    const validationError = new ValidationError('Validation failed', errors, requestId, req.path, req.method);
    const response = validationError.toAPIResponse();
    
    res.status(400).json(response);
    return;
  }

  next();
};

/**
 * Validate FDC ID parameter
 */
export const validateFdcId = (req: Request, res: Response, next: NextFunction): void => {
  const { fdcId } = req.params;
  const errors: ValidationErrorItem[] = [];

  if (!fdcId) {
    errors.push({
      field: 'fdcId',
      message: 'FDC ID parameter is required'
    });
  } else {
    const id = parseInt(fdcId, 10);
    if (isNaN(id)) {
      errors.push({
        field: 'fdcId',
        message: 'FDC ID must be a valid number',
        value: fdcId
      });
    } else if (id <= 0) {
      errors.push({
        field: 'fdcId',
        message: 'FDC ID must be a positive number',
        value: id
      });
    }
  }

  if (errors.length > 0) {
    const requestId = (req as any).requestId;
    const validationError = new ValidationError('Invalid FDC ID', errors, requestId, req.path, req.method);
    const response = validationError.toAPIResponse();
    
    res.status(400).json(response);
    return;
  }

  next();
};

/**
 * Sanitize input to prevent XSS and injection attacks
 */
export const sanitizeInput = (req: Request, res: Response, next: NextFunction): void => {
  // Sanitize query parameters
  if (req.query && typeof req.query === 'object') {
    for (const key in req.query) {
      if (typeof req.query[key] === 'string') {
        req.query[key] = xss(req.query[key] as string);
      }
    }
  }

  // Sanitize body parameters if present
  if (req.body && typeof req.body === 'object') {
    for (const key in req.body) {
      if (typeof req.body[key] === 'string') {
        req.body[key] = xss(req.body[key]);
      }
    }
  }

  next();
};
