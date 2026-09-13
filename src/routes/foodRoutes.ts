import { Router, Request, Response } from 'express';
import { FoodController } from '../controllers/foodController';
import { USDAService } from '../services/usdaService';
import { asyncHandler } from '../middleware/errorHandler';
import {
  validateFoodSearch, validateFdcId, validateBarcode, validateBatchIds,
  validateCompareIds, validateSuggest, sanitizeInput,
} from '../middleware/validation';
import { searchLimiter, batchLimiter } from '../middleware/rateLimiter';

const router = Router();

let usdaService: USDAService;
let foodController: FoodController;

const getServices = () => {
  if (!usdaService) {
    usdaService = new USDAService(process.env.USDA_API_KEY || '');
    foodController = new FoodController(usdaService);
  }
  return { usdaService, foodController };
};

// ─── IMPORTANT: Specific named routes BEFORE /:fdcId wildcard ─────────────

/**
 * GET /api/foods/suggest?q=apple&limit=10
 * Autocomplete / typeahead suggestions
 */
router.get('/suggest',
  searchLimiter,
  sanitizeInput,
  validateSuggest,
  asyncHandler((req: Request, res: Response) => {
    const { foodController } = getServices();
    return foodController.autoSuggest(req, res);
  })
);

/**
 * GET /api/foods/compare?ids=123,456,789
 * Side-by-side comparison of 2–5 foods
 */
router.get('/compare',
  searchLimiter,
  sanitizeInput,
  validateCompareIds,
  asyncHandler((req: Request, res: Response) => {
    const { foodController } = getServices();
    return foodController.compareFoods(req, res);
  })
);

/**
 * GET /api/foods/top?nutrient=protein&q=chicken&limit=10&order=desc
 * Top foods ranked by any nutrient
 */
router.get('/top',
  searchLimiter,
  sanitizeInput,
  asyncHandler((req: Request, res: Response) => {
    const { foodController } = getServices();
    return foodController.getTopByNutrient(req, res);
  })
);

/**
 * POST /api/foods/batch
 * Lookup up to 20 foods at once
 * Body: { "fdcIds": [123, 456, 789] }
 */
router.post('/batch',
  batchLimiter,
  sanitizeInput,
  validateBatchIds,
  asyncHandler((req: Request, res: Response) => {
    const { foodController } = getServices();
    return foodController.batchFoods(req, res);
  })
);

/**
 * GET /api/foods/barcode/:upc
 * Lookup a food product by UPC/EAN barcode via Open Food Facts
 */
router.get('/barcode/:upc',
  searchLimiter,
  validateBarcode,
  asyncHandler((req: Request, res: Response) => {
    const { foodController } = getServices();
    return foodController.lookupBarcode(req, res);
  })
);

/**
 * GET /api/foods/diet/:dietType?q=chicken&pageSize=25
 * Filter food search by diet type
 * Valid: keto, low-carb, high-protein, low-fat, low-calorie, low-sodium,
 *        gluten-free, dairy-free, vegan, vegetarian
 */
router.get('/diet/:dietType',
  searchLimiter,
  sanitizeInput,
  asyncHandler((req: Request, res: Response) => {
    const { foodController } = getServices();
    return foodController.searchByDiet(req, res);
  })
);

/**
 * GET /api/foods?type=apple&pageSize=25
 * Standard food search (original endpoint)
 */
router.get('/',
  searchLimiter,
  sanitizeInput,
  validateFoodSearch,
  asyncHandler((req: Request, res: Response) => {
    const { foodController } = getServices();
    return foodController.searchFoods(req, res);
  })
);

/**
 * GET /api/foods/search?type=apple&dataType=Branded&brand=Kraft&sortBy=protein&minCalories=100
 * Enhanced search with filters
 */
router.get('/search',
  searchLimiter,
  sanitizeInput,
  validateFoodSearch,
  asyncHandler((req: Request, res: Response) => {
    const { foodController } = getServices();
    return foodController.searchFoodsEnhanced(req, res);
  })
);

// ─── /:fdcId routes — MUST be last to avoid matching named paths ──────────

/**
 * GET /api/foods/:fdcId/full-nutrition
 * Complete vitamin/mineral panel (30+ nutrients with FDA daily value %)
 */
router.get('/:fdcId/full-nutrition',
  searchLimiter,
  validateFdcId,
  asyncHandler((req: Request, res: Response) => {
    const { foodController } = getServices();
    return foodController.getFullNutrition(req, res);
  })
);

/**
 * GET /api/foods/:fdcId/allergens
 * Detect FDA Big 9 allergens from ingredients
 */
router.get('/:fdcId/allergens',
  searchLimiter,
  validateFdcId,
  asyncHandler((req: Request, res: Response) => {
    const { foodController } = getServices();
    return foodController.getFoodAllergens(req, res);
  })
);

/**
 * GET /api/foods/:fdcId/score
 * Nutritional health score 0–100 with grade (A–F) and breakdown
 */
router.get('/:fdcId/score',
  searchLimiter,
  validateFdcId,
  asyncHandler((req: Request, res: Response) => {
    const { foodController } = getServices();
    return foodController.getFoodScore(req, res);
  })
);

/**
 * GET /api/foods/:fdcId/nutrition
 * Basic nutrition (original endpoint)
 */
router.get('/:fdcId/nutrition',
  searchLimiter,
  validateFdcId,
  asyncHandler((req: Request, res: Response) => {
    const { foodController } = getServices();
    return foodController.getFoodNutrition(req, res);
  })
);

/**
 * GET /api/foods/:fdcId
 * Raw USDA food details (original endpoint)
 */
router.get('/:fdcId',
  searchLimiter,
  validateFdcId,
  asyncHandler((req: Request, res: Response) => {
    const { foodController } = getServices();
    return foodController.getFoodDetails(req, res);
  })
);

export default router;
