import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import foodRoutes from './routes/foodRoutes';
import calculatorRoutes from './routes/calculatorRoutes';
import { errorHandler, notFoundHandler, requestIdMiddleware } from './middleware/errorHandler';
import { FoodController } from './controllers/foodController';
import { USDAService } from './services/usdaService';
import { generalLimiter, healthCheckLimiter } from './middleware/rateLimiter';

// Load .env from project root
const _envPaths = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(__dirname, '.env'),
  path.resolve(__dirname, '../src/.env'),
  path.resolve(__dirname, '../.env'),
];
let _loadedEnvPath: string | null = null;
for (const _p of _envPaths) {
  if (fs.existsSync(_p)) {
    dotenv.config({ path: _p });
    _loadedEnvPath = _p;
    break;
  }
}
if (_loadedEnvPath) {
  console.log(`Loaded environment variables from ${_loadedEnvPath}`);
} else {
  dotenv.config();
  console.log('No .env file found; using process environment variables');
}

class App {
  public app: Application;
  private port: number;

  constructor() {
    this.app = express();
    this.port = parseInt(process.env.PORT || '3000', 10);
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

    if (process.env.NODE_ENV === 'production') {
      this.app.use(morgan('combined', {
        skip: (req) => req.path === '/health' || req.path === '/api/health',
      }));
    } else {
      this.app.use(morgan('dev'));
    }

    // Response time header
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

    this.app.use((req, res, next) => {
      req.setTimeout(30000, () => {
        res.status(408).json({ success: false, error: 'Request timeout', message: 'Request took too long to process' });
      });
      next();
    });
  }

  private initializeRoutes(): void {
    // Health endpoints
    const makeHealthController = () =>
      new FoodController(new USDAService(process.env.USDA_API_KEY || ''));

    this.app.get('/health', healthCheckLimiter, (req: Request, res: Response) => {
      makeHealthController().healthCheck(req, res);
    });
    this.app.get('/api/health', healthCheckLimiter, (req: Request, res: Response) => {
      makeHealthController().healthCheck(req, res);
    });

    // API routes
    this.app.use('/api/foods', foodRoutes);
    this.app.use('/api/calculator', calculatorRoutes);

    // Root — full documentation
    this.app.get('/', (req: Request, res: Response) => {
      const base = `${req.protocol}://${req.get('host')}`;
      const requestId = (req as any).requestId;

      res.json({
        success: true,
        message: 'Welcome to Food API v2.0',
        version: '2.0.0',
        description: 'A full-featured food & nutrition API powered by USDA Food Data Central and Open Food Facts. Search foods, scan barcodes, calculate meal macros, detect allergens, get health scores, and filter by diet type — all in one place.',
        baseUrl: base,
        requestId,
        timestamp: new Date().toISOString(),

        endpoints: {
          // ── Core ──────────────────────────────────────────────────────────
          health: {
            method: 'GET', path: '/health',
            description: 'API health status and USDA connectivity check',
            example: `${base}/health`,
          },

          // ── Search ────────────────────────────────────────────────────────
          searchFoods: {
            method: 'GET', path: '/api/foods',
            description: 'Search USDA database for foods with nutrition data',
            params: { type: 'required', pageSize: '1–200 (default 25)', pageNumber: 'default 1' },
            example: `${base}/api/foods?type=chicken+breast&pageSize=10`,
          },
          searchEnhanced: {
            method: 'GET', path: '/api/foods/search',
            description: 'Enhanced search with filters: data type, brand, calorie range, sorting',
            params: {
              type: 'required',
              dataType: 'Branded | Foundation | SR Legacy | Survey (FNDDS)',
              brand: 'brand owner filter',
              minCalories: 'minimum calories filter',
              maxCalories: 'maximum calories filter',
              sortBy: 'calories | protein | fat | carbohydrates | fiber | sugar',
              sortOrder: 'asc | desc',
            },
            example: `${base}/api/foods/search?type=beef&dataType=Foundation&sortBy=protein&sortOrder=desc`,
          },
          autoSuggest: {
            method: 'GET', path: '/api/foods/suggest',
            description: 'Autocomplete / typeahead — fast list of matching food names',
            params: { q: 'required, min 2 chars', limit: '1–20 (default 10)' },
            example: `${base}/api/foods/suggest?q=chick&limit=8`,
          },

          // ── Barcode ───────────────────────────────────────────────────────
          barcodeSearch: {
            method: 'GET', path: '/api/foods/barcode/:upc',
            description: 'Look up any product by UPC/EAN barcode (8–14 digits). Returns name, brand, nutrition, allergens, Nutri-Score, and image URL via Open Food Facts.',
            params: { upc: 'UPC-A (12), EAN-13 (13), UPC-E (8), or EAN-8 barcode' },
            example: `${base}/api/foods/barcode/0123456789012`,
          },

          // ── Diet ──────────────────────────────────────────────────────────
          dietSearch: {
            method: 'GET', path: '/api/foods/diet/:dietType',
            description: 'Search foods filtered by diet compatibility',
            params: {
              dietType: 'keto | low-carb | high-protein | low-fat | low-calorie | low-sodium | gluten-free | dairy-free | vegan | vegetarian',
              q: 'food to search for (default: "food")',
              pageSize: '1–200 (default 25)',
            },
            example: `${base}/api/foods/diet/keto?q=beef&pageSize=10`,
          },

          // ── Comparison & Ranking ──────────────────────────────────────────
          compareFoods: {
            method: 'GET', path: '/api/foods/compare',
            description: 'Side-by-side comparison of 2–5 foods with insights (highest protein, lowest fat, etc.)',
            params: { ids: 'comma-separated FDC IDs (2–5)' },
            example: `${base}/api/foods/compare?ids=1102653,2705956,167758`,
          },
          topByNutrient: {
            method: 'GET', path: '/api/foods/top',
            description: 'Rank foods by any nutrient — highest protein, most fiber, most vitamin C, etc.',
            params: {
              nutrient: 'calories | protein | fat | carbohydrates | fiber | sugar | sodium | calcium | iron | potassium | vitamin-c | vitamin-a | vitamin-d | magnesium | zinc',
              q: 'food search query',
              limit: '1–50 (default 10)',
              order: 'desc (default) | asc',
            },
            example: `${base}/api/foods/top?nutrient=protein&q=chicken&limit=10`,
          },

          // ── Batch & Calculator ────────────────────────────────────────────
          batchLookup: {
            method: 'POST', path: '/api/foods/batch',
            description: 'Fetch nutrition data for up to 20 foods in a single request',
            body: '{ "fdcIds": [123, 456, 789] }',
            example: `${base}/api/foods/batch`,
          },
          mealCalculator: {
            method: 'POST', path: '/api/calculator/meal',
            description: 'Calculate total calories, macros, and FDA daily value percentages for a full meal. Each item specifies a food FDC ID and portion in grams.',
            body: '{ "items": [{ "fdcId": 1102653, "grams": 150, "label": "Banana" }, { "fdcId": 2705956, "grams": 100 }] }',
            example: `${base}/api/calculator/meal`,
          },

          // ── Per-food analysis ─────────────────────────────────────────────
          foodDetails: {
            method: 'GET', path: '/api/foods/:fdcId',
            description: 'Raw USDA food details by FDC ID',
            example: `${base}/api/foods/1102653`,
          },
          basicNutrition: {
            method: 'GET', path: '/api/foods/:fdcId/nutrition',
            description: 'Basic nutrition (calories + macros)',
            example: `${base}/api/foods/1102653/nutrition`,
          },
          fullNutrition: {
            method: 'GET', path: '/api/foods/:fdcId/full-nutrition',
            description: 'Complete nutrition panel: 30+ nutrients including all vitamins and minerals with FDA daily value percentages',
            example: `${base}/api/foods/1102653/full-nutrition`,
          },
          allergens: {
            method: 'GET', path: '/api/foods/:fdcId/allergens',
            description: 'Detect FDA Big 9 allergens (milk, eggs, fish, shellfish, tree nuts, peanuts, wheat, soy, sesame) from ingredient list',
            example: `${base}/api/foods/1102653/allergens`,
          },
          healthScore: {
            method: 'GET', path: '/api/foods/:fdcId/score',
            description: 'Nutritional health score 0–100 with letter grade (A–F) and factor breakdown (protein, fiber, vitamins vs saturated fat, sodium, sugar)',
            example: `${base}/api/foods/1102653/score`,
          },
        },

        rateLimiting: {
          general:    '100 requests per 15 minutes per IP',
          search:     '30 requests per 1 minute per IP',
          batch:      '5 requests per 1 minute per IP (batch/calculator)',
          health:     '60 requests per 1 minute per IP',
        },

        dataSources: {
          usda: {
            name: 'USDA Food Data Central',
            url: 'https://fdc.nal.usda.gov',
            description: 'Primary source for nutritional data. 600,000+ foods across Branded, Foundation, SR Legacy, and Survey datasets.',
          },
          openFoodFacts: {
            name: 'Open Food Facts',
            url: 'https://world.openfoodfacts.org',
            description: 'Used for barcode lookups. Community database of 2.5M+ products with Nutri-Score, allergen tags, and product images.',
          },
        },

        errorCodes: {
          400: 'Bad Request — invalid parameters',
          404: 'Not Found — food or barcode not in database',
          408: 'Request Timeout',
          429: 'Too Many Requests — rate limit exceeded',
          500: 'Internal Server Error',
          502: 'Bad Gateway — USDA API connectivity issue',
          503: 'Service Unavailable — USDA API temporarily down',
        },

        usdaDisclaimer: 'Data provided by the U.S. Department of Agriculture, Agricultural Research Service, Food Data Central, 2019. https://fdc.nal.usda.gov/',
      });
    });
  }

  private initializeErrorHandling(): void {
    this.app.use(notFoundHandler);
    this.app.use(errorHandler);
  }

  public listen(): void {
    console.log('Environment:', process.env.USDA_API_KEY ? 'USDA_API_KEY SET' : 'USDA_API_KEY NOT SET');

    if (!process.env.USDA_API_KEY) {
      console.error('Error: USDA_API_KEY environment variable is required');
      console.error('Get a free key at: https://fdc.nal.usda.gov/api-guide.html');
      process.exit(1);
    }

    this.app.listen(this.port, () => {
      console.log(`Food API v2.0 running on port ${this.port}`);
      console.log(`Health: http://localhost:${this.port}/health`);
      console.log(`Search: http://localhost:${this.port}/api/foods?type=apple`);
      console.log(`Docs:   http://localhost:${this.port}/`);
    });
  }
}

process.on('uncaughtException', (error: Error) => {
  console.error('Uncaught Exception:', error.message);
  setTimeout(() => process.exit(1), 100);
});

process.on('unhandledRejection', (reason: any) => {
  const error = reason instanceof Error ? reason : new Error(String(reason));
  console.error('Unhandled Rejection:', error.message);
  setTimeout(() => process.exit(1), 100);
});

process.on('SIGTERM', () => { console.log('SIGTERM received, shutting down'); process.exit(0); });
process.on('SIGINT',  () => { console.log('SIGINT received, shutting down');  process.exit(0); });

const app = new App();
app.listen();
