import { Router, Request, Response } from 'express';
import { FoodController } from '../controllers/foodController';
import { USDAService } from '../services/usdaService';
import { asyncHandler } from '../middleware/errorHandler';
import { validateFoodSearch, validateFdcId, sanitizeInput } from '../middleware/validation';
import { searchLimiter } from '../middleware/rateLimiter';

const router = Router();

// Lazy initialization of services to ensure environment variables are loaded
let usdaService: USDAService;
let foodController: FoodController;

const getServices = () => {
  if (!usdaService) {
    usdaService = new USDAService(process.env.USDA_API_KEY || '');
    foodController = new FoodController(usdaService);
  }
  return { usdaService, foodController };
};

/**
 * @route GET /foods
 * @desc Search for foods in USDA database
 * @query type (required) - Food type to search for
 * @query pageSize (optional) - Number of results per page (1-200, default: 25)
 * @query pageNumber (optional) - Page number (default: 1)
 * @access Public
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
 * @route GET /foods/:fdcId/nutrition
 * @desc Get detailed nutrition information about a specific food
 * @param fdcId - Food Data Central ID
 * @access Public
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
 * @route GET /foods/:fdcId
 * @desc Get detailed information about a specific food (raw USDA data)
 * @param fdcId - Food Data Central ID
 * @access Public
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
