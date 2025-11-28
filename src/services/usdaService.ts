import axios, { AxiosResponse, AxiosError, AxiosInstance } from 'axios';
import { USDASearchResponse, SearchParams, NutritionSearchResult, USDAFood, ExtractedNutritionData } from '../types';
import { NutritionExtractor } from '../utils/nutritionExtractor';
import { USDAAPIError, NetworkError, ParsingError, FoodNotFoundError, ErrorCode } from '../types/errors';
import { CacheService } from './cacheService';
import http from 'http';
import https from 'https';

export class USDAService {
  private readonly baseURL = 'https://api.nal.usda.gov/fdc/v1';
  private readonly apiKey: string;
  private readonly axiosInstance: AxiosInstance;
  private readonly cache: CacheService;
  
  // HTTP agent with keep-alive for connection reuse
  private readonly httpAgent = new http.Agent({
    keepAlive: true,
    keepAliveMsecs: 1000,
    maxSockets: 50,
    maxFreeSockets: 10,
    timeout: 60000
  });

  private readonly httpsAgent = new https.Agent({
    keepAlive: true,
    keepAliveMsecs: 1000,
    maxSockets: 50,
    maxFreeSockets: 10,
    timeout: 60000
  });

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.cache = CacheService.getInstance();
    
    // Create optimized axios instance with connection pooling
    this.axiosInstance = axios.create({
      baseURL: this.baseURL,
      timeout: 8000, // Reduced from 10s for faster failures
      httpAgent: this.httpAgent,
      httpsAgent: this.httpsAgent,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'FoodAPI/1.0.0',
        'Connection': 'keep-alive',
        'Accept-Encoding': 'gzip, deflate, br'
      },
      // Enable compression
      decompress: true,
      // Max redirects
      maxRedirects: 3,
      // Validate status
      validateStatus: (status) => status < 500
    });
  }

  /**
   * Search for foods in the USDA database with extracted nutrition data
   * @param params - Search parameters including food type and pagination
   * @returns Promise with processed nutrition data
   */
  async searchFoodsWithNutrition(params: SearchParams, requestId?: string): Promise<NutritionSearchResult> {
    // Check cache first
    const cacheKey = CacheService.generateKey('search', {
      type: params.type,
      pageSize: params.pageSize,
      pageNumber: params.pageNumber
    });
    
    const cached = this.cache.get<NutritionSearchResult>(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const rawResponse = await this.searchFoodsRaw(params, requestId);
      const result = NutritionExtractor.extractNutritionData(rawResponse, params.type);
      
      // Cache result for 5 minutes
      this.cache.set(cacheKey, result, 5 * 60 * 1000);
      
      return result;
    } catch (error: unknown) {
      // Re-throw AppError instances, wrap others
      if (error instanceof USDAAPIError || error instanceof NetworkError || error instanceof ParsingError) {
        throw error;
      }
      throw new ParsingError('Failed to extract nutrition data from USDA response', error, requestId);
    }
  }

  /**
   * Search for foods in the USDA database (raw response)
   * @param params - Search parameters including food type and pagination
   * @returns Promise with raw search results
   */
  async searchFoods(params: SearchParams, requestId?: string): Promise<USDASearchResponse> {
    return this.searchFoodsRaw(params, requestId);
  }

  /**
   * Internal method to make raw API call
   */
  async searchFoodsRaw(params: SearchParams, requestId?: string): Promise<USDASearchResponse> {
    const { type, pageSize = 25, pageNumber = 1 } = params;

    if (!type || type.trim().length === 0) {
      throw new Error('Food type parameter is required');
    }

    const searchParams = {
      query: type.trim(),
      pageSize: Math.min(Math.max(pageSize, 1), 200), // Limit between 1-200
      pageNumber: Math.max(pageNumber, 1), // Minimum page 1
      api_key: this.apiKey,
      sortBy: 'dataType.keyword',
      sortOrder: 'asc'
    };

    try {
      // Use optimized axios instance with connection pooling
      const response: AxiosResponse<USDASearchResponse> = await this.axiosInstance.get(
        '/foods/search',
        {
          params: searchParams
        }
      );

      // Check if response has valid data structure
      if (!response.data || typeof response.data !== 'object') {
        throw new ParsingError('Invalid response format from USDA API', response.data, requestId);
      }

      // Check if no foods found
      if (!response.data.foods || response.data.foods.length === 0) {
        throw new FoodNotFoundError(type, undefined, requestId);
      }

      return response.data;
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError;
        
        if (axiosError.response) {
          // Server responded with error status
          const status = axiosError.response.status;
          const message = (axiosError.response.data as any)?.message || axiosError.response.statusText || 'Unknown error';
          
          throw new USDAAPIError(status, message, axiosError, requestId);
        } else if (axiosError.request) {
          // Request was made but no response received
          throw new NetworkError('USDA API', axiosError, requestId);
        } else {
          // Something else happened
          throw new NetworkError('USDA API', axiosError, requestId);
        }
      } else if (error instanceof FoodNotFoundError || error instanceof ParsingError) {
        // Re-throw our custom errors
        throw error;
      } else {
        // Non-axios error
        throw new NetworkError('USDA API', error, requestId);
      }
    }
  }

  /**
   * Get detailed information about a specific food by FDC ID
   * @param fdcId - Food Data Central ID
   * @returns Promise with detailed food information
   */
  async getFoodDetails(fdcId: number, requestId?: string): Promise<any> {
    if (!fdcId || fdcId <= 0) {
      throw new Error('Valid FDC ID is required');
    }

    // Check cache first
    const cacheKey = CacheService.generateKey('food', { fdcId });
    const cached = this.cache.get<any>(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      // Use optimized axios instance
      const response = await this.axiosInstance.get(
        `/food/${fdcId}`,
        {
          params: {
            api_key: this.apiKey
          }
        }
      );

      // Check if response has valid data structure
      if (!response.data || typeof response.data !== 'object') {
        throw new ParsingError('Invalid response format from USDA API', response.data, requestId);
      }

      // Cache for 10 minutes (food details change less frequently)
      this.cache.set(cacheKey, response.data, 10 * 60 * 1000);
      
      return response.data;
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError;
        
        if (axiosError.response) {
          const status = axiosError.response.status;
          const message = (axiosError.response.data as any)?.message || axiosError.response.statusText || 'Unknown error';
          
          if (status === 404) {
            throw new FoodNotFoundError(undefined, fdcId, requestId);
          }
          
          throw new USDAAPIError(status, message, axiosError, requestId);
        } else if (axiosError.request) {
          throw new NetworkError('USDA API', axiosError, requestId);
        } else {
          throw new NetworkError('USDA API', axiosError, requestId);
        }
      } else if (error instanceof FoodNotFoundError || error instanceof ParsingError) {
        throw error;
      } else {
        throw new NetworkError('USDA API', error, requestId);
      }
    }
  }

  /**
   * Get detailed nutrition information for a specific food
   * @param fdcId - Food Data Central ID
   * @returns Promise with extracted nutrition data
   */
  async getFoodNutrition(fdcId: number, requestId?: string): Promise<ExtractedNutritionData | null> {
    // Check cache first
    const cacheKey = CacheService.generateKey('nutrition', { fdcId });
    const cached = this.cache.get<ExtractedNutritionData>(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const foodDetails = await this.getFoodDetails(fdcId, requestId);
      const nutrition = NutritionExtractor.getDetailedNutrition(foodDetails as USDAFood);
      
      // Cache nutrition data for 10 minutes
      if (nutrition) {
        this.cache.set(cacheKey, nutrition, 10 * 60 * 1000);
      }
      
      return nutrition;
    } catch (error: unknown) {
      // Re-throw AppError instances, wrap others
      if (error instanceof USDAAPIError || error instanceof NetworkError || error instanceof ParsingError || error instanceof FoodNotFoundError) {
        throw error;
      }
      throw new ParsingError('Failed to extract nutrition data from food details', error, requestId);
    }
  }
}
