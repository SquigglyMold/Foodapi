import { VercelRequest, VercelResponse } from '@vercel/node';
import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import foodRoutes from '../src/routes/foodRoutes';
import { errorHandler, notFoundHandler, requestIdMiddleware } from '../src/middleware/errorHandler';
import { FoodController } from '../src/controllers/foodController';
import { USDAService } from '../src/services/usdaService';
import { generalLimiter, healthCheckLimiter } from '../src/middleware/rateLimiter';

// Load environment variables from root or src if present
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
const _envPaths = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(__dirname, '../src/.env'),
  path.resolve(__dirname, '../.env'),
  path.resolve(__dirname, '.env')
];
let _loadedEnvPathApi: string | null = null;
for (const _p of _envPaths) {
  if (fs.existsSync(_p)) {
    dotenv.config({ path: _p });
    _loadedEnvPathApi = _p;
    break;
  }
}
if (_loadedEnvPathApi) {
  console.log(`🔁 Loaded environment variables from ${_loadedEnvPathApi}`);
} else {
  dotenv.config(); // fallback
  console.log('ℹ️ No .env file found in root or src for API; using process environment variables');
}

class App {
  public app: Application;

  constructor() {
    this.app = express();
    this.initializeMiddlewares();
    this.initializeRoutes();
    this.initializeErrorHandling();
  }

  private initializeMiddlewares(): void {
    // Request ID middleware (applied first)
    this.app.use(requestIdMiddleware);
    
    // Compression middleware (should be early in the stack)
    this.app.use(compression({
      level: 6, // Balance between compression and CPU usage
      threshold: 1024, // Only compress responses larger than 1KB
      filter: (req, res) => {
        // Don't compress if client doesn't support it
        if (req.headers['x-no-compression']) {
          return false;
        }
        return compression.filter(req, res);
      }
    }));
    
    // Rate limiting
    this.app.use(generalLimiter);
    
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
        },
      },
      crossOriginEmbedderPolicy: false
    }));
    
    // CORS configuration
    this.app.use(cors({
      origin: process.env.NODE_ENV === 'production' 
        ? process.env.ALLOWED_ORIGINS?.split(',') || false
        : true,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
      exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset']
    }));

    // Logging middleware - optimized for serverless
    // Skip logging for health checks to reduce overhead
    this.app.use(morgan('combined', {
      skip: (req) => req.path === '/health' || req.path === '/api/health'
    }));
    
    // Add response time header (set before response is sent)
    this.app.use((req, res, next) => {
      const start = Date.now();
      const originalSend = res.send;
      res.send = function(body) {
        const duration = Date.now() - start;
        if (!res.headersSent) {
          res.setHeader('X-Response-Time', `${duration}ms`);
        }
        return originalSend.call(this, body);
      };
      next();
    });

    // Body parsing middleware
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Request timeout (reduced for serverless)
    this.app.use((req, res, next) => {
      req.setTimeout(25000, () => {
        res.status(408).json({
          success: false,
          error: 'Request timeout',
          message: 'Request took too long to process'
        });
      });
      next();
    });
  }

  private initializeRoutes(): void {
    // Health check endpoint with rate limiting
    this.app.get('/health', healthCheckLimiter, (req, res) => {
      const foodController = new FoodController(new USDAService(process.env.USDA_API_KEY || ''));
      foodController.healthCheck(req, res);
    });

    // API routes
    this.app.use('/api/foods', foodRoutes);

    // Root endpoint
    this.app.get('/', (req, res) => {
      const response = {
        success: true,
        message: 'Food API - USDA Food Database Integration',
        version: '1.0.0',
        environment: process.env.NODE_ENV || 'development',
        endpoints: {
          health: '/health',
          search: '/api/foods?type=apple&pageSize=5',
          foodDetails: '/api/foods/:fdcId',
          nutrition: '/api/foods/:fdcId/nutrition'
        },
        documentation: {
          search: 'GET /api/foods?type={food_type}&pageSize={number}&pageNumber={number}',
          foodDetails: 'GET /api/foods/{fdc_id}',
          nutrition: 'GET /api/foods/{fdc_id}/nutrition'
        }
      };
      res.json(response);
    });
  }

  private initializeErrorHandling(): void {
    this.app.use(notFoundHandler);
    this.app.use(errorHandler);
  }
}

// Create the Express app instance
const app = new App().app;

// Export the Express app as a Vercel serverless function
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Enable CORS for all routes
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Handle the request using Express
  return new Promise((resolve, reject) => {
    app(req as any, res as any, (err: any) => {
      if (err) {
        reject(err);
      } else {
        resolve(undefined);
      }
    });
  });
}
