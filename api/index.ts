import { VercelRequest, VercelResponse } from '@vercel/node';
import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import foodRoutes from '../src/routes/foodRoutes';
import calculatorRoutes from '../src/routes/calculatorRoutes';
import { errorHandler, notFoundHandler, requestIdMiddleware } from '../src/middleware/errorHandler';
import { FoodController } from '../src/controllers/foodController';
import { USDAService } from '../src/services/usdaService';
import { generalLimiter, healthCheckLimiter } from '../src/middleware/rateLimiter';

// Load .env
const _envPaths = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(__dirname, '../src/.env'),
  path.resolve(__dirname, '../.env'),
  path.resolve(__dirname, '.env'),
];
for (const _p of _envPaths) {
  if (fs.existsSync(_p)) { dotenv.config({ path: _p }); break; }
}
dotenv.config();

class App {
  public app: Application;

  constructor() {
    this.app = express();
    this.initializeMiddlewares();
    this.initializeRoutes();
    this.initializeErrorHandling();
  }

  private initializeMiddlewares(): void {
    this.app.use(requestIdMiddleware);

    this.app.use(compression({
      level: 6,
      threshold: 1024,
      filter: (req, res) => {
        if (req.headers['x-no-compression']) return false;
        return compression.filter(req, res);
      },
    }));

    this.app.use(generalLimiter);

    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc:   ["'self'", "'unsafe-inline'"],
          scriptSrc:  ["'self'"],
          imgSrc:     ["'self'", "data:", "https:"],
        },
      },
      crossOriginEmbedderPolicy: false,
    }));

    this.app.use(cors({
      origin: process.env.NODE_ENV === 'production'
        ? process.env.ALLOWED_ORIGINS?.split(',') || false
        : true,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
      exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
    }));

    this.app.use(morgan('combined', {
      skip: (req) => req.path === '/health' || req.path === '/api/health',
    }));

    // Response time header — _req intentionally unused
    this.app.use((_req, res, next) => {
      const start = Date.now();
      const orig = res.send;
      res.send = function (body) {
        if (!res.headersSent) res.setHeader('X-Response-Time', `${Date.now() - start}ms`);
        return orig.call(this, body);
      };
      next();
    });

    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // 25s timeout (Vercel serverless max)
    this.app.use((req, res, next) => {
      req.setTimeout(25000, () => {
        res.status(408).json({ success: false, error: 'Request timeout', message: 'Request took too long to process' });
      });
      next();
    });
  }

  private initializeRoutes(): void {
    const makeController = () => new FoodController(new USDAService(process.env.USDA_API_KEY || ''));

    this.app.get('/health', healthCheckLimiter, (req: Request, res: Response) => {
      makeController().healthCheck(req, res);
    });
    this.app.get('/api/health', healthCheckLimiter, (req: Request, res: Response) => {
      makeController().healthCheck(req, res);
    });

    this.app.use('/api/foods', foodRoutes);
    this.app.use('/api/calculator', calculatorRoutes);

    this.app.get('/', (req: Request, res: Response) => {
      const base = `${req.protocol}://${req.get('host')}`;
      res.json({
        success: true,
        message: 'Food API v2.0',
        version: '2.0.0',
        description: 'Full-featured food & nutrition API — search, barcode lookup, meal calculator, allergen detection, health scores, diet filtering, and more.',
        endpoints: {
          search:          `${base}/api/foods?type=chicken&pageSize=10`,
          searchEnhanced:  `${base}/api/foods/search?type=beef&sortBy=protein&sortOrder=desc`,
          suggest:         `${base}/api/foods/suggest?q=chick&limit=8`,
          barcode:         `${base}/api/foods/barcode/0123456789012`,
          dietSearch:      `${base}/api/foods/diet/keto?q=beef`,
          compare:         `${base}/api/foods/compare?ids=1102653,2705956`,
          topByNutrient:   `${base}/api/foods/top?nutrient=protein&q=chicken`,
          batch:           `POST ${base}/api/foods/batch  { "fdcIds": [123,456] }`,
          mealCalculator:  `POST ${base}/api/calculator/meal  { "items": [{"fdcId":123,"grams":150}] }`,
          foodDetails:     `${base}/api/foods/1102653`,
          basicNutrition:  `${base}/api/foods/1102653/nutrition`,
          fullNutrition:   `${base}/api/foods/1102653/full-nutrition`,
          allergens:       `${base}/api/foods/1102653/allergens`,
          healthScore:     `${base}/api/foods/1102653/score`,
          health:          `${base}/health`,
        },
        requestId: (req as any).requestId,
        timestamp: new Date().toISOString(),
      });
    });
  }

  private initializeErrorHandling(): void {
    this.app.use(notFoundHandler);
    this.app.use(errorHandler);
  }
}

const app = new App().app;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  return new Promise((resolve, reject) => {
    app(req as any, res as any, (err: any) => {
      if (err) reject(err);
      else resolve(undefined);
    });
  });
}
