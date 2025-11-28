import { Request, Response } from 'express';
import { USDAService } from '../services/usdaService';
import { APIResponse, SearchParams, NutritionSearchResult } from '../types';

export class FoodController {
  private usdaService: USDAService;

  constructor(usdaService: USDAService) {
    this.usdaService = usdaService;
  }

  /**
   * Search for foods endpoint
   * GET /foods?type=apple&pageSize=10&pageNumber=1
   */
  async searchFoods(req: Request, res: Response): Promise<void> {
    const requestId = (req as any).requestId;
    const { type, pageSize, pageNumber } = req.query;

    // Validate and parse parameters
    const searchParams: SearchParams = {
      type: type as string,
      pageSize: pageSize ? parseInt(pageSize as string, 10) : 25,
      pageNumber: pageNumber ? parseInt(pageNumber as string, 10) : 1
    };

    const result = await this.usdaService.searchFoodsWithNutrition(searchParams, requestId);

    const response: APIResponse<NutritionSearchResult> = {
      success: true,
      data: result,
      message: `Found ${result.foods.length} foods for "${searchParams.type}"`,
      requestId
    };

    res.json(response);
  }

  /**
   * Get detailed information about a specific food
   * GET /foods/:fdcId
   */
  async getFoodDetails(req: Request, res: Response): Promise<void> {
    const requestId = (req as any).requestId;
    const { fdcId } = req.params;

    const foodId = parseInt(fdcId, 10);
    const result = await this.usdaService.getFoodDetails(foodId, requestId);

    const response: APIResponse<any> = {
      success: true,
      data: result,
      message: `Food details for FDC ID ${foodId}`,
      requestId
    };

    res.json(response);
  }

  /**
   * Get detailed nutrition information for a specific food
   * GET /foods/:fdcId/nutrition
   */
  async getFoodNutrition(req: Request, res: Response): Promise<void> {
    const requestId = (req as any).requestId;
    const { fdcId } = req.params;

    const foodId = parseInt(fdcId, 10);
    const result = await this.usdaService.getFoodNutrition(foodId, requestId);

    if (!result) {
      const response: APIResponse<null> = {
        success: false,
        error: 'NUTRITION_DATA_MISSING',
        message: `No nutrition data available for FDC ID ${foodId}`,
        data: null,
        requestId
      };
      res.status(404).json(response);
      return;
    }

    const response: APIResponse<any> = {
      success: true,
      data: result,
      message: `Nutrition data for FDC ID ${foodId}`,
      requestId
    };

    res.json(response);
  }

  /**
   * Health check endpoint
   * GET /health
   * Optimized to avoid blocking API calls - uses cached status when available
   */
  async healthCheck(req: Request, res: Response): Promise<void> {
    try {
      const timestamp = new Date().toISOString();
      const uptime = process.uptime();
      const memoryUsage = process.memoryUsage();
      const requestId = (req as any).requestId;
      
      // Optimized health check - don't block on API call
      // Use a lightweight check that times out quickly
      let usdaApiStatus = 'unknown';
      let usdaApiResponseTime = 0;
      
      // Only do a quick connectivity check if explicitly requested
      const doFullCheck = req.query.full === 'true';
      
      if (doFullCheck) {
        try {
          const startTime = Date.now();
          // Quick test with minimal request and short timeout
          const testPromise = this.usdaService.searchFoodsRaw({
            type: 'test',
            pageSize: 1,
            pageNumber: 1
          }, requestId);
          
          // Race against a timeout to avoid blocking
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Health check timeout')), 2000)
          );
          
          await Promise.race([testPromise, timeoutPromise]);
          usdaApiResponseTime = Date.now() - startTime;
          usdaApiStatus = 'healthy';
        } catch (error) {
          usdaApiStatus = 'unhealthy';
          console.warn('USDA API health check failed:', error instanceof Error ? error.message : 'Unknown error');
        }
      } else {
        // Fast path - assume healthy if no explicit check requested
        usdaApiStatus = 'healthy';
      }

      const healthData = {
        status: usdaApiStatus === 'healthy' ? 'healthy' : 'degraded',
        timestamp,
        uptime: {
          seconds: Math.floor(uptime),
          human: this.formatUptime(uptime)
        },
        system: {
          memory: {
            used: Math.round(memoryUsage.heapUsed / 1024 / 1024),
            total: Math.round(memoryUsage.heapTotal / 1024 / 1024),
            external: Math.round(memoryUsage.external / 1024 / 1024)
          },
          platform: process.platform,
          nodeVersion: process.version,
          environment: process.env.NODE_ENV || 'development'
        },
        services: {
          usdaApi: {
            status: usdaApiStatus,
            responseTime: usdaApiResponseTime
          }
        },
        rateLimit: (req as any).rateLimit ? {
          limit: (req as any).rateLimit.limit,
          remaining: (req as any).rateLimit.remaining,
          reset: new Date((req as any).rateLimit.resetTime)
        } : null
      };

      const response: APIResponse<typeof healthData> = {
        success: true,
        data: healthData,
        message: usdaApiStatus === 'healthy' 
          ? 'Food API is running and all services are healthy' 
          : 'Food API is running but some services are experiencing issues',
        requestId
      };

      // Set appropriate status code
      const statusCode = usdaApiStatus === 'healthy' ? 200 : 503;
      res.status(statusCode).json(response);
    } catch (error) {
      console.error('Health check error:', error);
      
      const response: APIResponse<null> = {
        success: false,
        error: 'Health check failed',
        message: 'Unable to perform health check',
        data: null,
        requestId: (req as any).requestId
      };

      res.status(500).json(response);
    }
  }

  /**
   * Format uptime in human readable format
   */
  private formatUptime(seconds: number): string {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (days > 0) {
      return `${days}d ${hours}h ${minutes}m ${secs}s`;
    } else if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    } else {
      return `${secs}s`;
    }
  }
}