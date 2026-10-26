import axios, { AxiosResponse, AxiosError, AxiosInstance } from 'axios';
import {
  USDASearchResponse, SearchParams, EnhancedSearchParams,
  NutritionSearchResult, USDAFood, ExtractedNutritionData,
  ComparisonResult, FoodComparisonItem, AutoSuggestResult,
  TopFoodsResult, TopFoodItem, DietSearchResult, DietFoodItem,
} from '../types';
import { NutritionExtractor } from '../utils/nutritionExtractor';
import { extractFullNutrition } from '../utils/fullNutritionExtractor';
import { checkDietCompatibility, foodMatchesDiet, DietType } from '../utils/dietCompatibility';
import { USDAAPIError, NetworkError, ParsingError, FoodNotFoundError } from '../types/errors';
import { CacheService } from './cacheService';
import http from 'http';
import https from 'https';

// Nutrient IDs used for sorting and top-foods queries
const NUTRIENT_SORT_MAP: Record<string, { id: number; unit: string; label: string }> = {
  calories:      { id: 1008, unit: 'kcal', label: 'Calories'      },
  protein:       { id: 1003, unit: 'g',    label: 'Protein'       },
  carbohydrates: { id: 1005, unit: 'g',    label: 'Carbohydrates' },
  fat:           { id: 1004, unit: 'g',    label: 'Total Fat'     },
  fiber:         { id: 1079, unit: 'g',    label: 'Fiber'         },
  sugar:         { id: 2000, unit: 'g',    label: 'Sugars'        },
  sodium:        { id: 1093, unit: 'mg',   label: 'Sodium'        },
  calcium:       { id: 1087, unit: 'mg',   label: 'Calcium'       },
  iron:          { id: 1089, unit: 'mg',   label: 'Iron'          },
  potassium:     { id: 1092, unit: 'mg',   label: 'Potassium'     },
  'vitamin-c':   { id: 1162, unit: 'mg',   label: 'Vitamin C'     },
  'vitamin-a':   { id: 1106, unit: 'mcg',  label: 'Vitamin A'     },
  'vitamin-d':   { id: 1114, unit: 'mcg',  label: 'Vitamin D'     },
  magnesium:     { id: 1090, unit: 'mg',   label: 'Magnesium'     },
  zinc:          { id: 1095, unit: 'mg',   label: 'Zinc'          },
};

// /food/{id} nests nutrients as {nutrient:{id,...}, amount}; /foods/search returns them flat. Extractors expect flat.
export function flattenNutrients(food: any): USDAFood {
  if (!Array.isArray(food?.foodNutrients)) return food;
  food.foodNutrients = food.foodNutrients
    .filter((n: any) => !n.nutrient || n.amount != null)
    .map((n: any) => !n.nutrient ? n : {
      nutrientId: n.nutrient.id,
      nutrientName: n.nutrient.name,
      nutrientNumber: n.nutrient.number,
      unitName: n.nutrient.unitName,
      value: n.amount,
    });
  return food;
}

export class USDAService {
  private readonly baseURL = 'https://api.nal.usda.gov/fdc/v1';
  private readonly apiKey: string;
  private readonly axiosInstance: AxiosInstance;
  private readonly cache: CacheService;

  private readonly httpAgent = new http.Agent({
    keepAlive: true, keepAliveMsecs: 1000, maxSockets: 50, maxFreeSockets: 10, timeout: 60000,
  });
  private readonly httpsAgent = new https.Agent({
    keepAlive: true, keepAliveMsecs: 1000, maxSockets: 50, maxFreeSockets: 10, timeout: 60000,
  });

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.cache = CacheService.getInstance();
    this.axiosInstance = axios.create({
      baseURL: this.baseURL,
      timeout: 8000,
      httpAgent: this.httpAgent,
      httpsAgent: this.httpsAgent,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'FoodAPI/2.0',
        'Connection': 'keep-alive',
        'Accept-Encoding': 'gzip, deflate, br',
      },
      decompress: true,
      maxRedirects: 3,
      validateStatus: (status) => status < 500,
    });
  }

  // ─── Existing methods ──────────────────────────────────────────────────────

  async searchFoodsWithNutrition(params: SearchParams, requestId?: string): Promise<NutritionSearchResult> {
    const cacheKey = CacheService.generateKey('search', {
      type: params.type, pageSize: params.pageSize, pageNumber: params.pageNumber,
    });
    const cached = this.cache.get<NutritionSearchResult>(cacheKey);
    if (cached) return cached;

    try {
      const rawResponse = await this.searchFoodsRaw(params, requestId);
      const result = NutritionExtractor.extractNutritionData(rawResponse, params.type);
      this.cache.set(cacheKey, result, 5 * 60 * 1000);
      return result;
    } catch (error: unknown) {
      if (error instanceof USDAAPIError || error instanceof NetworkError || error instanceof ParsingError) throw error;
      throw new ParsingError('Failed to extract nutrition data from USDA response', error, requestId);
    }
  }

  async searchFoods(params: SearchParams, requestId?: string): Promise<USDASearchResponse> {
    return this.searchFoodsRaw(params, requestId);
  }

  async searchFoodsRaw(params: SearchParams, requestId?: string): Promise<USDASearchResponse> {
    const { type, pageSize = 25, pageNumber = 1 } = params;

    if (!type || type.trim().length === 0) throw new Error('Food type parameter is required');

    const searchParams: Record<string, any> = {
      query: type.trim(),
      pageSize: Math.min(Math.max(pageSize, 1), 200),
      pageNumber: Math.max(pageNumber, 1),
      api_key: this.apiKey,
      sortBy: 'dataType.keyword',
      sortOrder: 'asc',
    };

    try {
      const response: AxiosResponse<USDASearchResponse> = await this.axiosInstance.get('/foods/search', { params: searchParams });

      if (!response.data || typeof response.data !== 'object') {
        throw new ParsingError('Invalid response format from USDA API', response.data, requestId);
      }
      if (!response.data.foods || response.data.foods.length === 0) {
        throw new FoodNotFoundError(type, undefined, requestId);
      }
      return response.data;
    } catch (error: unknown) {
      return this.handleAxiosError(error, requestId);
    }
  }

  async getFoodDetails(fdcId: number, requestId?: string): Promise<USDAFood> {
    if (!fdcId || fdcId <= 0) throw new Error('Valid FDC ID is required');

    const cacheKey = CacheService.generateKey('food', { fdcId });
    const cached = this.cache.get<USDAFood>(cacheKey);
    if (cached) return cached;

    try {
      const response = await this.axiosInstance.get(`/food/${fdcId}`, { params: { api_key: this.apiKey } });

      if (!response.data || typeof response.data !== 'object') {
        throw new ParsingError('Invalid response format from USDA API', response.data, requestId);
      }

      const food = flattenNutrients(response.data);
      this.cache.set(cacheKey, food, 10 * 60 * 1000);
      return food;
    } catch (error: unknown) {
      return this.handleAxiosError(error, requestId, fdcId);
    }
  }

  async getFoodNutrition(fdcId: number, requestId?: string): Promise<ExtractedNutritionData | null> {
    const cacheKey = CacheService.generateKey('nutrition', { fdcId });
    const cached = this.cache.get<ExtractedNutritionData>(cacheKey);
    if (cached) return cached;

    try {
      const foodDetails = await this.getFoodDetails(fdcId, requestId);
      const nutrition = NutritionExtractor.getDetailedNutrition(foodDetails);
      if (nutrition) this.cache.set(cacheKey, nutrition, 10 * 60 * 1000);
      return nutrition;
    } catch (error: unknown) {
      if (error instanceof USDAAPIError || error instanceof NetworkError ||
          error instanceof ParsingError || error instanceof FoodNotFoundError) throw error;
      throw new ParsingError('Failed to extract nutrition data from food details', error, requestId);
    }
  }

  // ─── Enhanced Search ───────────────────────────────────────────────────────

  async searchFoodsEnhanced(params: EnhancedSearchParams, requestId?: string): Promise<NutritionSearchResult> {
    const cacheKey = CacheService.generateKey('search_enhanced', params);
    const cached = this.cache.get<NutritionSearchResult>(cacheKey);
    if (cached) return cached;

    const usdaParams: Record<string, any> = {
      query: params.type.trim(),
      pageSize: Math.min(Math.max(params.pageSize || 25, 1), 200),
      pageNumber: Math.max(params.pageNumber || 1, 1),
      api_key: this.apiKey,
      sortBy: 'dataType.keyword',
      sortOrder: 'asc',
    };

    // Pass data type filter to USDA directly
    if (params.dataType) {
      usdaParams['dataType'] = params.dataType;
    }
    // Pass brand filter
    if (params.brand) {
      usdaParams['brandOwner'] = params.brand;
    }

    try {
      const response: AxiosResponse<USDASearchResponse> = await this.axiosInstance.get('/foods/search', { params: usdaParams });
      if (!response.data?.foods?.length) throw new FoodNotFoundError(params.type, undefined, requestId);

      let result = NutritionExtractor.extractNutritionData(response.data, params.type);

      // Client-side calorie range filtering
      if (params.minCalories !== undefined || params.maxCalories !== undefined) {
        result = {
          ...result,
          foods: result.foods.filter(f => {
            if (params.minCalories !== undefined && f.calories < params.minCalories) return false;
            if (params.maxCalories !== undefined && f.calories > params.maxCalories) return false;
            return true;
          }),
        };
      }

      // Client-side nutrient sorting
      if (params.sortBy && params.sortBy !== 'relevance') {
        const order = params.sortOrder === 'desc' ? -1 : 1;
        result = {
          ...result,
          foods: [...result.foods].sort((a, b) => {
            const aVal = this.getExtractedNutrientValue(a, params.sortBy!);
            const bVal = this.getExtractedNutrientValue(b, params.sortBy!);
            return (aVal - bVal) * order;
          }),
        };
      }

      this.cache.set(cacheKey, result, 5 * 60 * 1000);
      return result;
    } catch (error: unknown) {
      if (error instanceof FoodNotFoundError) throw error;
      return this.handleAxiosError(error, requestId);
    }
  }

  // ─── Full Nutrition Panel ──────────────────────────────────────────────────

  async getFullNutrition(fdcId: number, requestId?: string) {
    const cacheKey = CacheService.generateKey('full_nutrition', { fdcId });
    const cached = this.cache.get<any>(cacheKey);
    if (cached) return cached;

    const food = await this.getFoodDetails(fdcId, requestId);
    const full = extractFullNutrition(food);
    this.cache.set(cacheKey, full, 10 * 60 * 1000);
    return full;
  }

  // ─── Batch Fetch (up to 20 foods) ─────────────────────────────────────────

  async getFoodsBatch(fdcIds: number[], requestId?: string): Promise<{ results: ExtractedNutritionData[]; errors: { fdcId: number; error: string }[] }> {
    const limited = fdcIds.slice(0, 20);
    const results: ExtractedNutritionData[] = [];
    const errors: { fdcId: number; error: string }[] = [];

    const settled = await Promise.allSettled(
      limited.map(id => this.getFoodNutrition(id, requestId))
    );

    settled.forEach((outcome, i) => {
      if (outcome.status === 'fulfilled' && outcome.value) {
        results.push(outcome.value);
      } else {
        errors.push({
          fdcId: limited[i],
          error: outcome.status === 'rejected'
            ? (outcome.reason?.message || 'Unknown error')
            : 'No nutrition data available',
        });
      }
    });

    return { results, errors };
  }

  // ─── Compare Foods ─────────────────────────────────────────────────────────

  async compareFoods(fdcIds: number[], requestId?: string): Promise<ComparisonResult> {
    const cacheKey = CacheService.generateKey('compare', { ids: [...fdcIds].sort().join(',') });
    const cached = this.cache.get<ComparisonResult>(cacheKey);
    if (cached) return cached;

    const limited = fdcIds.slice(0, 5);
    const settled = await Promise.allSettled(limited.map(id => this.getFoodDetails(id, requestId)));

    const foods: FoodComparisonItem[] = [];
    settled.forEach((outcome, i) => {
      if (outcome.status === 'fulfilled') {
        const f = outcome.value;
        const getN = (id: number) => this.getNutrientFromFood(f, id);
        foods.push({
          fdcId: f.fdcId,
          description: f.description,
          brandName: f.brandOwner || f.brandName,
          dataType: f.dataType,
          calories:      getN(1008),
          protein:       getN(1003),
          carbohydrates: getN(1005),
          fat:           getN(1004),
          fiber:         getN(1079) || undefined,
          sugar:         getN(2000) || undefined,
          sodium:        getN(1093) || undefined,
        });
      }
    });

    if (foods.length === 0) throw new FoodNotFoundError(undefined, undefined, requestId);

    const pick = (fn: (a: FoodComparisonItem, b: FoodComparisonItem) => boolean) => {
      const winner = foods.reduce((best, f) => fn(f, best) ? f : best, foods[0]);
      return { fdcId: winner.fdcId, description: winner.description, value: 0 };
    };

    const insights: ComparisonResult['insights'] = {
      highestCalories: this.findExtreme(foods, 'calories', 'max'),
      lowestCalories:  this.findExtreme(foods, 'calories', 'min'),
      highestProtein:  this.findExtreme(foods, 'protein', 'max'),
      lowestFat:       this.findExtreme(foods, 'fat', 'min'),
      highestFiber:    this.findExtreme(foods, 'fiber', 'max'),
    };

    const result: ComparisonResult = { foods, insights };
    this.cache.set(cacheKey, result, 10 * 60 * 1000);
    return result;
  }

  // ─── Autocomplete Suggestions ──────────────────────────────────────────────

  async getAutoSuggestions(query: string, limit: number = 10, requestId?: string): Promise<AutoSuggestResult> {
    const cacheKey = CacheService.generateKey('suggest', { query: query.toLowerCase(), limit });
    const cached = this.cache.get<AutoSuggestResult>(cacheKey);
    if (cached) return cached;

    try {
      const response: AxiosResponse<USDASearchResponse> = await this.axiosInstance.get('/foods/search', {
        params: { query: query.trim(), pageSize: Math.min(limit, 20), pageNumber: 1, api_key: this.apiKey },
      });

      const foods = (response.data?.foods || []).map(f => ({
        fdcId: f.fdcId,
        description: f.description?.trim().substring(0, 100) || '',
        brandName: f.brandOwner || f.brandName,
        dataType: f.dataType,
      }));

      const result: AutoSuggestResult = {
        suggestions: foods,
        query,
        total: response.data?.totalHits || foods.length,
      };

      this.cache.set(cacheKey, result, 5 * 60 * 1000);
      return result;
    } catch {
      return { suggestions: [], query, total: 0 };
    }
  }

  // ─── Top Foods by Nutrient ─────────────────────────────────────────────────

  async getTopFoodsByNutrient(
    nutrient: string,
    query: string,
    limit: number = 10,
    sortOrder: 'asc' | 'desc' = 'desc',
    requestId?: string
  ): Promise<TopFoodsResult> {
    const nutrientConfig = NUTRIENT_SORT_MAP[nutrient.toLowerCase()];
    if (!nutrientConfig) throw new Error(`Unknown nutrient: ${nutrient}. Valid options: ${Object.keys(NUTRIENT_SORT_MAP).join(', ')}`);

    const cacheKey = CacheService.generateKey('top', { nutrient, query, limit, sortOrder });
    const cached = this.cache.get<TopFoodsResult>(cacheKey);
    if (cached) return cached;

    // Fetch a larger set to sort from
    const response: AxiosResponse<USDASearchResponse> = await this.axiosInstance.get('/foods/search', {
      params: {
        query: query.trim(),
        pageSize: 100,
        pageNumber: 1,
        api_key: this.apiKey,
      },
    });

    const rawFoods = response.data?.foods || [];
    const nutrition = NutritionExtractor.extractNutritionData(
      { foods: rawFoods, totalHits: rawFoods.length, currentPage: 1, totalPages: 1 },
      query
    );

    // Attach nutrient value for sorting
    const withValues: TopFoodItem[] = nutrition.foods.map(f => {
      const rawFood = rawFoods.find(r => r.fdcId === f.fdcId);
      const nutrientValue = rawFood ? this.getNutrientFromFood(rawFood, nutrientConfig.id) : 0;
      return { ...f, nutrientValue, nutrientUnit: nutrientConfig.unit };
    });

    const order = sortOrder === 'desc' ? -1 : 1;
    const sorted = withValues
      .filter(f => f.nutrientValue > 0)
      .sort((a, b) => (a.nutrientValue - b.nutrientValue) * order)
      .slice(0, limit);

    const result: TopFoodsResult = {
      nutrient: nutrientConfig.label,
      unit: nutrientConfig.unit,
      sortOrder,
      searchQuery: query,
      foods: sorted,
    };

    this.cache.set(cacheKey, result, 5 * 60 * 1000);
    return result;
  }

  // ─── Diet Search ───────────────────────────────────────────────────────────

  async searchByDiet(
    dietType: DietType,
    query: string,
    pageSize: number = 25,
    pageNumber: number = 1,
    requestId?: string
  ): Promise<DietSearchResult> {
    const cacheKey = CacheService.generateKey('diet_search', { dietType, query, pageSize, pageNumber });
    const cached = this.cache.get<DietSearchResult>(cacheKey);
    if (cached) return cached;

    // Fetch a batch larger than requested so we can filter and still fill the page
    const fetchSize = Math.min(pageSize * 4, 200);
    const response: AxiosResponse<USDASearchResponse> = await this.axiosInstance.get('/foods/search', {
      params: {
        query: query.trim(),
        pageSize: fetchSize,
        pageNumber: 1,
        api_key: this.apiKey,
      },
    });

    const rawFoods = response.data?.foods || [];
    const totalHits = response.data?.totalHits || 0;

    const matched: DietFoodItem[] = [];

    for (const rawFood of rawFoods) {
      if (foodMatchesDiet(rawFood, dietType)) {
        const extracted = NutritionExtractor.getDetailedNutrition(rawFood);
        if (!extracted) continue;

        const compat = checkDietCompatibility(rawFood);
        // Return only the relevant diet flag for this search
        const dietInfo: Partial<typeof compat> = {};
        const key = dietType.replace('-', '') as keyof typeof compat;
        (dietInfo as any)[key] = (compat as any)[key];

        matched.push({ ...extracted, dietInfo });
      }
    }

    // Paginate the filtered results
    const start = (pageNumber - 1) * pageSize;
    const page = matched.slice(start, start + pageSize);
    const totalPages = Math.ceil(matched.length / pageSize);

    const result: DietSearchResult = {
      dietType,
      searchQuery: query,
      foods: page,
      totalMatched: matched.length,
      totalSearched: rawFoods.length,
      currentPage: pageNumber,
      totalPages,
    };

    this.cache.set(cacheKey, result, 5 * 60 * 1000);
    return result;
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private getNutrientFromFood(food: USDAFood, nutrientId: number): number {
    if (!food.foodNutrients) return 0;
    const n = food.foodNutrients.find(n => n.nutrientId === nutrientId);
    if (!n || n.value == null) return 0;
    const v = parseFloat(n.value.toString());
    return isNaN(v) || v < 0 ? 0 : Math.round(v * 100) / 100;
  }

  private getExtractedNutrientValue(food: ExtractedNutritionData, sortBy: string): number {
    switch (sortBy) {
      case 'calories':      return food.calories;
      case 'protein':       return food.macronutrients.protein;
      case 'carbohydrates': return food.macronutrients.carbohydrates;
      case 'fat':           return food.macronutrients.fat;
      case 'fiber':         return food.macronutrients.fiber ?? 0;
      case 'sugar':         return food.macronutrients.sugar ?? 0;
      default:              return 0;
    }
  }

  private findExtreme(
    foods: FoodComparisonItem[],
    field: keyof FoodComparisonItem,
    direction: 'min' | 'max'
  ): { fdcId: number; description: string; value: number } {
    const f = foods.reduce((best, cur) => {
      const curVal  = (cur[field] as number) ?? 0;
      const bestVal = (best[field] as number) ?? 0;
      return direction === 'max' ? (curVal > bestVal ? cur : best) : (curVal < bestVal ? cur : best);
    }, foods[0]);
    return { fdcId: f.fdcId, description: f.description, value: (f[field] as number) ?? 0 };
  }

  private handleAxiosError(error: unknown, requestId?: string, fdcId?: number): never {
    if (axios.isAxiosError(error)) {
      const ae = error as AxiosError;
      if (ae.response) {
        const status = ae.response.status;
        const msg = (ae.response.data as any)?.message || ae.response.statusText || 'Unknown error';
        if (status === 404) throw new FoodNotFoundError(undefined, fdcId, requestId);
        throw new USDAAPIError(status, msg, ae, requestId);
      }
      throw new NetworkError('USDA API', ae, requestId);
    }
    if (error instanceof FoodNotFoundError || error instanceof ParsingError) throw error;
    throw new NetworkError('USDA API', error, requestId);
  }
}
