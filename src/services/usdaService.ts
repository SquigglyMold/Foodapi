import axios, { AxiosResponse, AxiosError } from 'axios';
import { USDASearchResponse, SearchParams, NutritionSearchResult, USDAFood, ExtractedNutritionData } from '../types';
import { NutritionExtractor } from '../utils/nutritionExtractor';
import { USDAAPIError, NetworkError, ParsingError, FoodNotFoundError, ErrorCode } from '../types/errors';

export class USDAService {
  private readonly baseURL = 'https://api.nal.usda.gov/fdc/v1';
  private readonly apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * Search for foods in the USDA database with extracted nutrition data
   * @param params - Search parameters including food type and pagination
   * @returns Promise with processed nutrition data
   */
  async searchFoodsWithNutrition(params: SearchParams, requestId?: string): Promise<NutritionSearchResult> {
    try {
      const rawResponse = await this.searchFoodsRaw(params, requestId);
      return NutritionExtractor.extractNutritionData(rawResponse, params.type);
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
      const response: AxiosResponse<USDASearchResponse> = await axios.get(
        `${this.baseURL}/foods/search`,
        {
          params: searchParams,
          timeout: 10000, // 10 second timeout
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'FoodAPI/1.0.0'
          }
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

    try {
      const response = await axios.get(
        `${this.baseURL}/food/${fdcId}`,
        {
          params: {
            api_key: this.apiKey
          },
          timeout: 10000,
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'FoodAPI/1.0.0'
          }
        }
      );

      // Check if response has valid data structure
      if (!response.data || typeof response.data !== 'object') {
        throw new ParsingError('Invalid response format from USDA API', response.data, requestId);
      }

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
    try {
      const foodDetails = await this.getFoodDetails(fdcId, requestId);
      return NutritionExtractor.getDetailedNutrition(foodDetails as USDAFood);
    } catch (error: unknown) {
      // Re-throw AppError instances, wrap others
      if (error instanceof USDAAPIError || error instanceof NetworkError || error instanceof ParsingError || error instanceof FoodNotFoundError) {
        throw error;
      }
      throw new ParsingError('Failed to extract nutrition data from food details', error, requestId);
    }
  }
}
