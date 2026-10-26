import { test, expect } from '@jest/globals';
import { flattenNutrients } from './usdaService';
import { NutritionExtractor } from '../utils/nutritionExtractor';

test('detail-shaped nutrients (nested) yield real calories', () => {
  const food = flattenNutrients({
    fdcId: 1102653, description: 'Banana, raw', dataType: 'Survey (FNDDS)',
    foodNutrients: [
      { type: 'FoodNutrient', nutrient: { id: 2045, number: '951', name: 'Proximates', unitName: 'g' } },
      { type: 'FoodNutrient', nutrient: { id: 1008, number: '208', name: 'Energy', unitName: 'kcal' }, amount: 89 },
      { type: 'FoodNutrient', nutrient: { id: 1003, number: '203', name: 'Protein', unitName: 'g' }, amount: 1.09 },
      { nutrientId: 1004, nutrientName: 'Total lipid (fat)', nutrientNumber: '204', unitName: 'g', value: 0.33 },
    ],
  });
  expect(food.foodNutrients).toHaveLength(3);
  const n = NutritionExtractor.getDetailedNutrition(food)!;
  expect(n.calories).toBe(89);
  expect(n.macronutrients.protein).toBeCloseTo(1.09);
  expect(n.macronutrients.fat).toBeCloseTo(0.33);
});
