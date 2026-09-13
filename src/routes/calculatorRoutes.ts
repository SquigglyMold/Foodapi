import { Router, Request, Response } from 'express';
import { FoodController } from '../controllers/foodController';
import { USDAService } from '../services/usdaService';
import { asyncHandler } from '../middleware/errorHandler';
import { validateMealItems, sanitizeInput } from '../middleware/validation';
import { batchLimiter } from '../middleware/rateLimiter';

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

/**
 * POST /api/calculator/meal
 * Calculate total calories and macros for a meal
 *
 * Body:
 * {
 *   "items": [
 *     { "fdcId": 1102653, "grams": 150, "label": "Chicken breast" },
 *     { "fdcId": 2003572, "grams": 100 }
 *   ]
 * }
 *
 * Returns total + per-item calories, macros, and FDA daily value percentages
 */
router.post('/meal',
  batchLimiter,
  sanitizeInput,
  validateMealItems,
  asyncHandler((req: Request, res: Response) => {
    const { foodController } = getServices();
    return foodController.calculateMeal(req, res);
  })
);

export default router;
