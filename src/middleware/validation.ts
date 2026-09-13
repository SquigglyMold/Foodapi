import { Request, Response, NextFunction } from 'express';
import { APIResponse } from '../types';
import { ValidationError, ErrorCode } from '../types/errors';
import xss from 'xss';
import { VALID_DIET_TYPES } from '../utils/dietCompatibility';

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

const VALID_FOOD_TYPE_REGEX   = /^[a-zA-Z0-9\s\-.,&()]+$/;
const VALID_BARCODE_REGEX     = /^\d{8,14}$/;
const VALID_SORT_BY           = ['calories', 'protein', 'fat', 'carbohydrates', 'fiber', 'sugar', 'relevance'];
const VALID_NUTRIENT_KEYS     = [
  'calories', 'protein', 'carbohydrates', 'fat', 'fiber', 'sugar',
  'sodium', 'calcium', 'iron', 'potassium', 'vitamin-c', 'vitamin-a',
  'vitamin-d', 'magnesium', 'zinc',
];

function fail(res: Response, requestId: string | undefined, errors: ValidationErrorItem[]): void {
  const ve = new ValidationError('Validation failed', errors, requestId);
  res.status(400).json(ve.toAPIResponse());
}

// ─── Sanitize ──────────────────────────────────────────────────────────────

export const sanitizeInput = (req: Request, res: Response, next: NextFunction): void => {
  if (req.query) {
    for (const key in req.query) {
      if (typeof req.query[key] === 'string') {
        req.query[key] = xss(req.query[key] as string);
      }
    }
  }
  if (req.body && typeof req.body === 'object') {
    sanitizeObject(req.body);
  }
  next();
};

function sanitizeObject(obj: any): void {
  for (const key in obj) {
    if (typeof obj[key] === 'string') {
      obj[key] = xss(obj[key]);
    } else if (Array.isArray(obj[key])) {
      obj[key].forEach((item: any, i: number) => {
        if (typeof item === 'string') obj[key][i] = xss(item);
        else if (typeof item === 'object' && item !== null) sanitizeObject(item);
      });
    } else if (typeof obj[key] === 'object' && obj[key] !== null) {
      sanitizeObject(obj[key]);
    }
  }
}

// ─── Food search ───────────────────────────────────────────────────────────

export const validateFoodSearch = (req: Request, res: Response, next: NextFunction): void => {
  const errors: ValidationErrorItem[] = [];
  const { type, pageSize, pageNumber } = req.query;

  if (!type) {
    errors.push({ field: 'type', message: 'Food type parameter is required' });
  } else {
    const t = (type as string).trim();
    if (t.length === 0)   errors.push({ field: 'type', message: 'Food type cannot be empty' });
    else if (t.length > 100) errors.push({ field: 'type', message: 'Food type must be 100 characters or less', value: type });
    else if (!VALID_FOOD_TYPE_REGEX.test(t)) {
      errors.push({ field: 'type', message: 'Food type contains invalid characters. Only letters, numbers, spaces, and basic punctuation are allowed', value: type });
    }
  }

  if (pageSize !== undefined) {
    const n = parseInt(pageSize as string, 10);
    if (isNaN(n))      errors.push({ field: 'pageSize', message: 'Page size must be a valid number', value: pageSize });
    else if (n < 1)    errors.push({ field: 'pageSize', message: 'Page size must be at least 1', value: n });
    else if (n > 200)  errors.push({ field: 'pageSize', message: 'Page size cannot exceed 200', value: n });
  }

  if (pageNumber !== undefined) {
    const n = parseInt(pageNumber as string, 10);
    if (isNaN(n))   errors.push({ field: 'pageNumber', message: 'Page number must be a valid number', value: pageNumber });
    else if (n < 1) errors.push({ field: 'pageNumber', message: 'Page number must be at least 1', value: n });
  }

  if (errors.length > 0) { fail(res, (req as any).requestId, errors); return; }
  next();
};

// ─── FDC ID ────────────────────────────────────────────────────────────────

export const validateFdcId = (req: Request, res: Response, next: NextFunction): void => {
  const errors: ValidationErrorItem[] = [];
  const { fdcId } = req.params;

  if (!fdcId) {
    errors.push({ field: 'fdcId', message: 'FDC ID parameter is required' });
  } else {
    const id = parseInt(fdcId, 10);
    if (isNaN(id))  errors.push({ field: 'fdcId', message: 'FDC ID must be a valid number', value: fdcId });
    else if (id <= 0) errors.push({ field: 'fdcId', message: 'FDC ID must be a positive number', value: id });
  }

  if (errors.length > 0) { fail(res, (req as any).requestId, errors); return; }
  next();
};

// ─── Barcode ───────────────────────────────────────────────────────────────

export const validateBarcode = (req: Request, res: Response, next: NextFunction): void => {
  const errors: ValidationErrorItem[] = [];
  const { upc } = req.params;

  if (!upc) {
    errors.push({ field: 'upc', message: 'Barcode parameter is required' });
  } else if (!VALID_BARCODE_REGEX.test(upc)) {
    errors.push({ field: 'upc', message: 'Barcode must be 8–14 digits (UPC-A, EAN-13, UPC-E, EAN-8)', value: upc });
  }

  if (errors.length > 0) { fail(res, (req as any).requestId, errors); return; }
  next();
};

// ─── Batch IDs ─────────────────────────────────────────────────────────────

export const validateBatchIds = (req: Request, res: Response, next: NextFunction): void => {
  const errors: ValidationErrorItem[] = [];
  const { fdcIds } = req.body || {};

  if (!fdcIds || !Array.isArray(fdcIds)) {
    errors.push({ field: 'fdcIds', message: 'fdcIds must be an array of integers' });
  } else if (fdcIds.length === 0) {
    errors.push({ field: 'fdcIds', message: 'fdcIds array must not be empty' });
  } else if (fdcIds.length > 20) {
    errors.push({ field: 'fdcIds', message: 'Maximum 20 FDC IDs per batch request', value: fdcIds.length });
  } else {
    fdcIds.forEach((id: any, i: number) => {
      if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0) {
        errors.push({ field: `fdcIds[${i}]`, message: 'Each FDC ID must be a positive integer', value: id });
      }
    });
  }

  if (errors.length > 0) { fail(res, (req as any).requestId, errors); return; }
  next();
};

// ─── Compare IDs ───────────────────────────────────────────────────────────

export const validateCompareIds = (req: Request, res: Response, next: NextFunction): void => {
  const errors: ValidationErrorItem[] = [];
  const { ids } = req.query;

  if (!ids) {
    errors.push({ field: 'ids', message: 'ids parameter is required (comma-separated FDC IDs, e.g. ?ids=123,456,789)' });
  } else {
    const parts = (ids as string).split(',').map(s => s.trim());
    if (parts.length < 2)  errors.push({ field: 'ids', message: 'At least 2 FDC IDs are required for comparison' });
    if (parts.length > 5)  errors.push({ field: 'ids', message: 'Maximum 5 FDC IDs per comparison request' });
    parts.forEach((p, i) => {
      const n = parseInt(p, 10);
      if (isNaN(n) || n <= 0) errors.push({ field: `ids[${i}]`, message: `Invalid FDC ID: "${p}"`, value: p });
    });
  }

  if (errors.length > 0) { fail(res, (req as any).requestId, errors); return; }
  next();
};

// ─── Suggest query ─────────────────────────────────────────────────────────

export const validateSuggest = (req: Request, res: Response, next: NextFunction): void => {
  const errors: ValidationErrorItem[] = [];
  const { q } = req.query;

  if (!q) {
    errors.push({ field: 'q', message: 'Search query parameter q is required' });
  } else {
    const query = (q as string).trim();
    if (query.length < 2)   errors.push({ field: 'q', message: 'Search query must be at least 2 characters', value: q });
    if (query.length > 100) errors.push({ field: 'q', message: 'Search query must be 100 characters or less', value: q });
  }

  if (errors.length > 0) { fail(res, (req as any).requestId, errors); return; }
  next();
};

// ─── Meal items ────────────────────────────────────────────────────────────

export const validateMealItems = (req: Request, res: Response, next: NextFunction): void => {
  const errors: ValidationErrorItem[] = [];
  const { items } = req.body || {};

  if (!items || !Array.isArray(items)) {
    errors.push({ field: 'items', message: 'items must be an array of { fdcId, grams } objects' });
  } else if (items.length === 0) {
    errors.push({ field: 'items', message: 'items array must not be empty' });
  } else if (items.length > 30) {
    errors.push({ field: 'items', message: 'Maximum 30 items per meal calculation', value: items.length });
  } else {
    items.forEach((item: any, i: number) => {
      if (!item || typeof item !== 'object') {
        errors.push({ field: `items[${i}]`, message: 'Each item must be an object with fdcId and grams' });
        return;
      }
      if (typeof item.fdcId !== 'number' || !Number.isInteger(item.fdcId) || item.fdcId <= 0) {
        errors.push({ field: `items[${i}].fdcId`, message: 'fdcId must be a positive integer', value: item.fdcId });
      }
      if (typeof item.grams !== 'number' || item.grams <= 0 || item.grams > 5000) {
        errors.push({ field: `items[${i}].grams`, message: 'grams must be a positive number up to 5000', value: item.grams });
      }
    });
  }

  if (errors.length > 0) { fail(res, (req as any).requestId, errors); return; }
  next();
};
