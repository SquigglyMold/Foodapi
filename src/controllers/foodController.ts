import { Request, Response } from 'express';
import { USDAService } from '../services/usdaService';
import { OpenFoodFactsService } from '../services/openFoodFactsService';
import { APIResponse, SearchParams, NutritionSearchResult, EnhancedSearchParams, MealItem, MealCalculatorResult, MealItemResult } from '../types';
import { detectAllergens } from '../utils/allergenDetector';
import { checkDietCompatibility } from '../utils/dietCompatibility';
import { calculateHealthScore } from '../utils/healthScorer';
import { VALID_DIET_TYPES, DietType } from '../utils/dietCompatibility';

export class FoodController {
  private usdaService: USDAService;
  private offService: OpenFoodFactsService;

  constructor(usdaService: USDAService) {
    this.usdaService = usdaService;
    this.offService = new OpenFoodFactsService();
  }

  // ─── Existing endpoints ────────────────────────────────────────────────────

  async searchFoods(req: Request, res: Response): Promise<void> {
    const requestId = (req as any).requestId;
    const { type, pageSize, pageNumber } = req.query;

    const searchParams: SearchParams = {
      type: type as string,
      pageSize: pageSize ? parseInt(pageSize as string, 10) : 25,
      pageNumber: pageNumber ? parseInt(pageNumber as string, 10) : 1,
    };

    const result = await this.usdaService.searchFoodsWithNutrition(searchParams, requestId);

    res.json({
      success: true,
      data: result,
      message: `Found ${result.foods.length} foods for "${searchParams.type}"`,
      requestId,
    } as APIResponse<NutritionSearchResult>);
  }

  async getFoodDetails(req: Request, res: Response): Promise<void> {
    const requestId = (req as any).requestId;
    const foodId = parseInt(req.params.fdcId, 10);
    const result = await this.usdaService.getFoodDetails(foodId, requestId);

    res.json({
      success: true,
      data: result,
      message: `Food details for FDC ID ${foodId}`,
      requestId,
    } as APIResponse<any>);
  }

  async getFoodNutrition(req: Request, res: Response): Promise<void> {
    const requestId = (req as any).requestId;
    const foodId = parseInt(req.params.fdcId, 10);
    const result = await this.usdaService.getFoodNutrition(foodId, requestId);

    if (!result) {
      res.status(404).json({
        success: false,
        error: 'NUTRITION_DATA_MISSING',
        message: `No nutrition data available for FDC ID ${foodId}`,
        data: null,
        requestId,
      } as APIResponse<null>);
      return;
    }

    res.json({ success: true, data: result, message: `Nutrition data for FDC ID ${foodId}`, requestId } as APIResponse<any>);
  }

  // ─── Enhanced Search ───────────────────────────────────────────────────────

  async searchFoodsEnhanced(req: Request, res: Response): Promise<void> {
    const requestId = (req as any).requestId;
    const { type, pageSize, pageNumber, dataType, brand, minCalories, maxCalories, sortBy, sortOrder } = req.query;

    const params: EnhancedSearchParams = {
      type: type as string,
      pageSize:    pageSize    ? parseInt(pageSize as string, 10)    : 25,
      pageNumber:  pageNumber  ? parseInt(pageNumber as string, 10)  : 1,
      dataType:    dataType   as string | undefined,
      brand:       brand      as string | undefined,
      minCalories: minCalories ? parseFloat(minCalories as string)   : undefined,
      maxCalories: maxCalories ? parseFloat(maxCalories as string)   : undefined,
      sortBy:      sortBy     as EnhancedSearchParams['sortBy'],
      sortOrder:   (sortOrder as 'asc' | 'desc') || 'desc',
    };

    const result = await this.usdaService.searchFoodsEnhanced(params, requestId);

    res.json({
      success: true,
      data: result,
      message: `Found ${result.foods.length} foods`,
      requestId,
    } as APIResponse<any>);
  }

  // ─── Full Nutrition Panel ──────────────────────────────────────────────────

  async getFullNutrition(req: Request, res: Response): Promise<void> {
    const requestId = (req as any).requestId;
    const foodId = parseInt(req.params.fdcId, 10);
    const result = await this.usdaService.getFullNutrition(foodId, requestId);

    res.json({
      success: true,
      data: result,
      message: `Full nutrition panel for FDC ID ${foodId} (30+ nutrients with FDA daily value percentages)`,
      requestId,
    } as APIResponse<any>);
  }

  // ─── Allergen Detection ────────────────────────────────────────────────────

  async getFoodAllergens(req: Request, res: Response): Promise<void> {
    const requestId = (req as any).requestId;
    const foodId = parseInt(req.params.fdcId, 10);
    const food = await this.usdaService.getFoodDetails(foodId, requestId);

    const allergenInfo = detectAllergens({
      ingredients: food.ingredients,
      description: food.description,
    });

    res.json({
      success: true,
      data: {
        fdcId: food.fdcId,
        description: food.description,
        brandName: food.brandOwner || food.brandName,
        allergens: allergenInfo,
      },
      message: allergenInfo.detected.length > 0
        ? `Contains ${allergenInfo.detected.length} allergen(s): ${allergenInfo.detected.join(', ')}`
        : allergenInfo.source === 'unavailable'
          ? 'No ingredient data available for allergen detection'
          : 'No major allergens detected',
      requestId,
    } as APIResponse<any>);
  }

  // ─── Health Score ──────────────────────────────────────────────────────────

  async getFoodScore(req: Request, res: Response): Promise<void> {
    const requestId = (req as any).requestId;
    const foodId = parseInt(req.params.fdcId, 10);
    const food = await this.usdaService.getFoodDetails(foodId, requestId);

    const score = calculateHealthScore(food);

    res.json({
      success: true,
      data: {
        fdcId: food.fdcId,
        description: food.description,
        brandName: food.brandOwner || food.brandName,
        healthScore: score,
      },
      message: `Health score: ${score.score}/100 (Grade ${score.grade} — ${score.label})`,
      requestId,
    } as APIResponse<any>);
  }

  // ─── Compare Foods ─────────────────────────────────────────────────────────

  async compareFoods(req: Request, res: Response): Promise<void> {
    const requestId = (req as any).requestId;
    const { ids } = req.query;

    const fdcIds = (ids as string)
      .split(',')
      .map(s => parseInt(s.trim(), 10))
      .filter(n => !isNaN(n) && n > 0);

    const result = await this.usdaService.compareFoods(fdcIds, requestId);

    res.json({
      success: true,
      data: result,
      message: `Comparison of ${result.foods.length} food(s)`,
      requestId,
    } as APIResponse<any>);
  }

  // ─── Batch Lookup ──────────────────────────────────────────────────────────

  async batchFoods(req: Request, res: Response): Promise<void> {
    const requestId = (req as any).requestId;
    const fdcIds: number[] = req.body.fdcIds;

    const result = await this.usdaService.getFoodsBatch(fdcIds, requestId);

    res.json({
      success: true,
      data: result,
      message: `Retrieved ${result.results.length} food(s). ${result.errors.length} failed.`,
      requestId,
    } as APIResponse<any>);
  }

  // ─── Autocomplete ──────────────────────────────────────────────────────────

  async autoSuggest(req: Request, res: Response): Promise<void> {
    const requestId = (req as any).requestId;
    const { q, limit } = req.query;

    const result = await this.usdaService.getAutoSuggestions(
      q as string,
      limit ? Math.min(parseInt(limit as string, 10), 20) : 10,
      requestId
    );

    res.json({
      success: true,
      data: result,
      message: `${result.suggestions.length} suggestions for "${q}"`,
      requestId,
    } as APIResponse<any>);
  }

  // ─── Top Foods by Nutrient ─────────────────────────────────────────────────

  async getTopByNutrient(req: Request, res: Response): Promise<void> {
    const requestId = (req as any).requestId;
    const { nutrient, q, limit, order } = req.query;

    if (!nutrient) {
      res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'nutrient parameter is required (e.g. protein, fiber, calcium, vitamin-c)',
        data: null,
        requestId,
      } as APIResponse<null>);
      return;
    }

    const result = await this.usdaService.getTopFoodsByNutrient(
      nutrient as string,
      (q as string) || 'food',
      limit ? Math.min(parseInt(limit as string, 10), 50) : 10,
      (order as 'asc' | 'desc') || 'desc',
      requestId
    );

    res.json({
      success: true,
      data: result,
      message: `Top ${result.foods.length} foods by ${result.nutrient} (${result.sortOrder === 'desc' ? 'highest first' : 'lowest first'})`,
      requestId,
    } as APIResponse<any>);
  }

  // ─── Diet Search ───────────────────────────────────────────────────────────

  async searchByDiet(req: Request, res: Response): Promise<void> {
    const requestId = (req as any).requestId;
    const { dietType } = req.params;
    const { q, pageSize, pageNumber } = req.query;

    if (!VALID_DIET_TYPES.includes(dietType as DietType)) {
      res.status(400).json({
        success: false,
        error: 'INVALID_DIET_TYPE',
        message: `Invalid diet type. Valid options: ${VALID_DIET_TYPES.join(', ')}`,
        data: null,
        requestId,
      } as APIResponse<null>);
      return;
    }

    const result = await this.usdaService.searchByDiet(
      dietType as DietType,
      (q as string) || 'food',
      pageSize ? parseInt(pageSize as string, 10) : 25,
      pageNumber ? parseInt(pageNumber as string, 10) : 1,
      requestId
    );

    res.json({
      success: true,
      data: result,
      message: `Found ${result.foods.length} ${dietType} foods matching "${result.searchQuery}" (${result.totalMatched} total matches from ${result.totalSearched} results)`,
      requestId,
    } as APIResponse<any>);
  }

  // ─── Barcode Lookup ────────────────────────────────────────────────────────

  async lookupBarcode(req: Request, res: Response): Promise<void> {
    const requestId = (req as any).requestId;
    const { upc } = req.params;

    const result = await this.offService.lookupBarcode(upc, requestId);

    if (result.source === 'not_found') {
      res.status(404).json({
        success: false,
        error: 'BARCODE_NOT_FOUND',
        message: `No product found for barcode ${upc}. Barcode may not be in Open Food Facts database.`,
        data: { barcode: upc, source: 'not_found' },
        requestId,
      } as APIResponse<any>);
      return;
    }

    res.json({
      success: true,
      data: result,
      message: `Product found: ${result.name || 'Unknown product'}`,
      requestId,
    } as APIResponse<any>);
  }

  // ─── Meal Calculator ───────────────────────────────────────────────────────

  async calculateMeal(req: Request, res: Response): Promise<void> {
    const requestId = (req as any).requestId;
    const items: MealItem[] = req.body.items;

    const limited = items.slice(0, 30);
    const DV_CALORIES = 2000;
    const DV_PROTEIN  = 50;
    const DV_CARBS    = 275;
    const DV_FAT      = 78;
    const DV_FIBER    = 28;

    const settled = await Promise.allSettled(
      limited.map(item => this.usdaService.getFoodNutrition(item.fdcId, requestId))
    );

    const itemResults: MealItemResult[] = [];
    let totalCalories = 0;
    let totalProtein  = 0;
    let totalCarbs    = 0;
    let totalFat      = 0;
    let totalFiber    = 0;
    let totalSugar    = 0;
    let totalWeight   = 0;
    let hasFiber      = false;
    let hasSugar      = false;

    settled.forEach((outcome, i) => {
      const item = limited[i];
      const scale = item.grams / 100; // All USDA data is per 100g

      if (outcome.status === 'fulfilled' && outcome.value) {
        const n = outcome.value;
        const cal  = Math.round(n.calories * scale * 10) / 10;
        const prot = Math.round(n.macronutrients.protein * scale * 100) / 100;
        const carb = Math.round(n.macronutrients.carbohydrates * scale * 100) / 100;
        const fat  = Math.round(n.macronutrients.fat * scale * 100) / 100;
        const fib  = n.macronutrients.fiber != null ? Math.round(n.macronutrients.fiber * scale * 100) / 100 : undefined;
        const sug  = n.macronutrients.sugar != null ? Math.round(n.macronutrients.sugar * scale * 100) / 100 : undefined;

        totalCalories += cal;
        totalProtein  += prot;
        totalCarbs    += carb;
        totalFat      += fat;
        if (fib != null) { totalFiber += fib; hasFiber = true; }
        if (sug != null) { totalSugar += sug; hasSugar = true; }
        totalWeight   += item.grams;

        itemResults.push({
          fdcId: item.fdcId,
          label: item.label || n.description,
          grams: item.grams,
          calories: cal,
          protein: prot,
          carbohydrates: carb,
          fat: fat,
          fiber: fib,
        });
      } else {
        itemResults.push({
          fdcId: item.fdcId,
          label: item.label || `FDC ${item.fdcId}`,
          grams: item.grams,
          calories: 0,
          protein: 0,
          carbohydrates: 0,
          fat: 0,
          error: outcome.status === 'rejected'
            ? (outcome.reason?.message || 'Failed to fetch')
            : 'No nutrition data',
        });
      }
    });

    const calFromProtein = totalProtein * 4;
    const calFromCarbs   = totalCarbs   * 4;
    const calFromFat     = totalFat     * 9;
    const totalMacroCal  = calFromProtein + calFromCarbs + calFromFat || 1;

    const result: MealCalculatorResult = {
      totalCalories:    Math.round(totalCalories * 10) / 10,
      totalWeightGrams: Math.round(totalWeight),
      macros: {
        protein: {
          grams:   Math.round(totalProtein * 100) / 100,
          calories: Math.round(calFromProtein),
          percent:  Math.round((calFromProtein / totalMacroCal) * 100),
        },
        carbohydrates: {
          grams:   Math.round(totalCarbs * 100) / 100,
          calories: Math.round(calFromCarbs),
          percent:  Math.round((calFromCarbs / totalMacroCal) * 100),
        },
        fat: {
          grams:   Math.round(totalFat * 100) / 100,
          calories: Math.round(calFromFat),
          percent:  Math.round((calFromFat / totalMacroCal) * 100),
        },
        ...(hasFiber ? { fiber: Math.round(totalFiber * 100) / 100 } : {}),
        ...(hasSugar ? { sugar: Math.round(totalSugar * 100) / 100 } : {}),
      },
      dailyValuePercents: {
        calories:      Math.round((totalCalories / DV_CALORIES) * 100),
        protein:       Math.round((totalProtein  / DV_PROTEIN)  * 100),
        carbohydrates: Math.round((totalCarbs    / DV_CARBS)    * 100),
        fat:           Math.round((totalFat      / DV_FAT)      * 100),
        ...(hasFiber ? { fiber: Math.round((totalFiber / DV_FIBER) * 100) } : {}),
      },
      items: itemResults,
    };

    res.json({
      success: true,
      data: result,
      message: `Meal totals for ${itemResults.length} item(s): ${Math.round(totalCalories)} kcal`,
      requestId,
    } as APIResponse<any>);
  }

  // ─── Health Check ──────────────────────────────────────────────────────────

  async healthCheck(req: Request, res: Response): Promise<void> {
    try {
      const requestId = (req as any).requestId;
      const uptime = process.uptime();
      const mem    = process.memoryUsage();
      const doFull = req.query.full === 'true';

      let usdaStatus = 'healthy';
      let usdaResponseTime = 0;

      if (doFull) {
        try {
          const t0 = Date.now();
          await Promise.race([
            this.usdaService.searchFoodsRaw({ type: 'test', pageSize: 1, pageNumber: 1 }, requestId),
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000)),
          ]);
          usdaResponseTime = Date.now() - t0;
        } catch {
          usdaStatus = 'unhealthy';
        }
      }

      res.status(usdaStatus === 'healthy' ? 200 : 503).json({
        success: true,
        data: {
          status: usdaStatus === 'healthy' ? 'healthy' : 'degraded',
          timestamp: new Date().toISOString(),
          uptime: { seconds: Math.floor(uptime), human: this.formatUptime(uptime) },
          system: {
            memory: {
              used:     Math.round(mem.heapUsed / 1024 / 1024),
              total:    Math.round(mem.heapTotal / 1024 / 1024),
              external: Math.round(mem.external / 1024 / 1024),
            },
            platform:    process.platform,
            nodeVersion: process.version,
            environment: process.env.NODE_ENV || 'development',
          },
          services: { usdaApi: { status: usdaStatus, responseTime: usdaResponseTime } },
          endpoints: {
            total: 14,
            new: ['barcode', 'full-nutrition', 'allergens', 'score', 'compare', 'batch', 'suggest', 'top', 'diet', 'calculator'],
          },
        },
        message: usdaStatus === 'healthy'
          ? 'Food API v2.0 is running — 14 endpoints available'
          : 'Food API is running but USDA API may be degraded',
        requestId,
      } as APIResponse<any>);
    } catch {
      res.status(500).json({
        success: false, error: 'Health check failed',
        message: 'Unable to perform health check', data: null,
        requestId: (req as any).requestId,
      } as APIResponse<null>);
    }
  }

  private formatUptime(seconds: number): string {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (d > 0) return `${d}d ${h}h ${m}m ${s}s`;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  }
}
