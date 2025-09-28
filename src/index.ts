import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import foodRoutes from './routes/foodRoutes';
import { errorHandler, notFoundHandler, requestIdMiddleware } from './middleware/errorHandler';
import { FoodController } from './controllers/foodController';
import { USDAService } from './services/usdaService';
import { generalLimiter, healthCheckLimiter } from './middleware/rateLimiter';

// Load environment variables
dotenv.config();

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
    // Request ID middleware (applied first)
    this.app.use(requestIdMiddleware);
    
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

    // Logging middleware
    this.app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

    // Body parsing middleware
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Request timeout
    this.app.use((req, res, next) => {
      req.setTimeout(30000, () => {
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
    this.app.get('/health', healthCheckLimiter, (req: Request, res: Response) => {
      const foodController = new FoodController(new USDAService(process.env.USDA_API_KEY || ''));
      foodController.healthCheck(req, res);
    });

    // API routes
    this.app.use('/api/foods', foodRoutes);

    // Root endpoint
    this.app.get('/', (req: Request, res: Response) => {
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const requestId = (req as any).requestId;
      
      res.json({
        success: true,
        message: 'Welcome to the Food API! 🍎',
        version: '1.0.0',
        description: 'A robust Express.js API that fetches food information from the USDA Food Database with built-in rate limiting, input validation, and health monitoring.',
        baseUrl: baseUrl,
        requestId: requestId,
        timestamp: new Date().toISOString(),
        
        endpoints: {
          health: {
            path: '/health',
            method: 'GET',
            description: 'Health check endpoint with system status and USDA API connectivity',
            example: `${baseUrl}/health`
          },
          searchFoods: {
            path: '/api/foods',
            method: 'GET',
            description: 'Search for foods in the USDA database with nutrition data',
            parameters: {
              type: 'Food name to search for (required, 1-100 characters)',
              pageSize: 'Number of results per page (optional, 1-200, default: 25)',
              pageNumber: 'Page number (optional, minimum: 1, default: 1)'
            },
            example: `${baseUrl}/api/foods?type=apple&pageSize=10`
          },
          getFoodNutrition: {
            path: '/api/foods/:fdcId/nutrition',
            method: 'GET',
            description: 'Get detailed nutrition information for a specific food by FDC ID',
            parameters: {
              fdcId: 'Food Data Central ID (required, positive integer)'
            },
            example: `${baseUrl}/api/foods/1102653/nutrition`
          },
          getFoodDetails: {
            path: '/api/foods/:fdcId',
            method: 'GET',
            description: 'Get raw food details from USDA database by FDC ID',
            parameters: {
              fdcId: 'Food Data Central ID (required, positive integer)'
            },
            example: `${baseUrl}/api/foods/1102653`
          }
        },

        features: [
          '🛡️ Rate limiting to prevent abuse',
          '✅ Comprehensive input validation',
          '🏥 Health monitoring with USDA API status',
          '🔒 CORS enabled and input sanitization',
          '📊 Nutritional data extraction (calories, macros)',
          '🎯 Clean JSON responses with error handling',
          '📝 Request ID tracking for debugging'
        ],

        rateLimiting: {
          general: '100 requests per 15 minutes per IP',
          search: '10 requests per 1 minute per IP',
          health: '60 requests per 1 minute per IP'
        },

        errorHandling: {
          '400': 'Bad Request - Invalid input parameters',
          '404': 'Not Found - Food or endpoint not found',
          '429': 'Too Many Requests - Rate limit exceeded',
          '500': 'Internal Server Error - Server configuration issues',
          '502': 'Bad Gateway - USDA API connectivity issues',
          '503': 'Service Unavailable - USDA API temporarily unavailable'
        },

        usdaDisclaimer: {
          important: '⚠️ USDA API DISCLAIMER',
          message: 'This API integrates with the USDA Food Data Central API. Please review the USDA Terms of Service and API usage guidelines.',
          links: {
            termsOfService: 'https://fdc.nal.usda.gov/terms-of-service.html',
            apiGuide: 'https://fdc.nal.usda.gov/api-guide.html',
            dataPolicy: 'https://fdc.nal.usda.gov/data-policy.html'
          },
          attribution: 'Data provided by the U.S. Department of Agriculture, Agricultural Research Service, Food Data Central, 2019. Available at: https://fdc.nal.usda.gov/'
        },

        documentation: {
          apiGuide: 'https://fdc.nal.usda.gov/api-guide.html',
          dataPolicy: 'https://fdc.nal.usda.gov/data-policy.html',
          github: 'https://github.com/SquigglyMold/Foodapi'
        },

        support: {
          issues: 'Report issues on GitHub',
          email: 'Contact the development team',
          status: 'Check /health endpoint for API status'
        }
      });
    });
  }

  private initializeErrorHandling(): void {
    // 404 handler
    this.app.use(notFoundHandler);
    
    // Global error handler
    this.app.use(errorHandler);
  }

  public listen(): void {
    // Debug environment variables
    console.log('🔍 Environment variables:');
    console.log('USDA_API_KEY:', process.env.USDA_API_KEY ? 'SET' : 'NOT SET');
    console.log('PORT:', process.env.PORT);
    console.log('NODE_ENV:', process.env.NODE_ENV);
    
    // Validate required environment variables
    if (!process.env.USDA_API_KEY) {
      console.error('❌ Error: USDA_API_KEY environment variable is required');
      console.error('Please get your free API key from: https://fdc.nal.usda.gov/api-guide.html');
      process.exit(1);
    }

    this.app.listen(this.port, () => {
      console.log(`🚀 Food API server is running on port ${this.port}`);
      console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🔗 Health check: http://localhost:${this.port}/health`);
      console.log(`🍎 Search foods: http://localhost:${this.port}/api/foods?type=apple`);
      console.log(`📖 API Documentation: http://localhost:${this.port}/`);
    });
  }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error: Error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received. Shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received. Shutting down gracefully...');
  process.exit(0);
});

// Start the server
const app = new App();
app.listen();
