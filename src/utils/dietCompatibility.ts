import { DietCompatibility, USDAFood } from '../types';
import { detectAllergens } from './allergenDetector';

// Per 100g thresholds
const THRESHOLDS = {
  KETO_MAX_CARBS:     10,   // g per 100g
  KETO_MIN_FAT:       5,    // g per 100g
  LOW_CARB_MAX_CARBS: 20,   // g per 100g
  HIGH_PROTEIN_MIN:   20,   // g per 100g
  LOW_FAT_MAX:        3,    // g per 100g
  LOW_CALORIE_MAX:    100,  // kcal per 100g
  LOW_SODIUM_MAX:     140,  // mg per serving
};

// Categories that indicate meat/animal products (not vegan/vegetarian)
const MEAT_CATEGORIES = [
  'beef', 'pork', 'lamb', 'veal', 'goat', 'poultry', 'chicken', 'turkey',
  'duck', 'game', 'venison', 'bison', 'rabbit', 'organ meat', 'hot dog',
  'sausage', 'bacon', 'deli meat', 'luncheon meat',
];

const FISH_CATEGORIES = [
  'fish', 'seafood', 'shellfish', 'finfish', 'salmon', 'tuna', 'shrimp',
  'crab', 'lobster', 'clam', 'oyster', 'mussel', 'scallop',
];

function getNutrient(food: USDAFood, id: number): number {
  if (!food.foodNutrients) return 0;
  const n = food.foodNutrients.find(n => n.nutrientId === id);
  if (!n || n.value == null) return 0;
  const v = parseFloat(n.value.toString());
  return isNaN(v) || v < 0 ? 0 : v;
}

export function checkDietCompatibility(food: USDAFood): DietCompatibility {
  const carbs    = getNutrient(food, 1005);
  const fat      = getNutrient(food, 1004);
  const protein  = getNutrient(food, 1003);
  const calories = getNutrient(food, 1008);
  const sodium   = getNutrient(food, 1093);

  const allergens = detectAllergens({ ingredients: food.ingredients, description: food.description });
  const hasGluten = allergens.detected.includes('wheat');
  const hasDairy  = allergens.detected.includes('milk');

  const notes: string[] = [];
  const categoryDesc = (food.foodCategory?.description || '').toLowerCase();

  // Determine meat/fish presence from category
  const hasMeat = MEAT_CATEGORIES.some(m => categoryDesc.includes(m));
  const hasFish = FISH_CATEGORIES.some(f => categoryDesc.includes(f));
  const hasAnimalProduct = hasMeat || hasFish || hasDairy ||
    allergens.detected.includes('eggs') ||
    allergens.detected.includes('fish') ||
    allergens.detected.includes('shellfish');

  // Keto: very low carb, moderate-high fat
  const keto = carbs <= THRESHOLDS.KETO_MAX_CARBS && fat >= THRESHOLDS.KETO_MIN_FAT;
  if (keto) notes.push(`Keto-friendly: ${carbs}g carbs per 100g`);

  // Low carb
  const lowCarb = carbs <= THRESHOLDS.LOW_CARB_MAX_CARBS;
  if (lowCarb && !keto) notes.push(`Low-carb: ${carbs}g carbs per 100g`);

  // High protein
  const highProtein = protein >= THRESHOLDS.HIGH_PROTEIN_MIN;
  if (highProtein) notes.push(`High-protein: ${protein}g per 100g`);

  // Low fat
  const lowFat = fat <= THRESHOLDS.LOW_FAT_MAX;
  if (lowFat) notes.push(`Low-fat: ${fat}g per 100g`);

  // Low calorie
  const lowCalorie = calories <= THRESHOLDS.LOW_CALORIE_MAX && calories > 0;
  if (lowCalorie) notes.push(`Low-calorie: ${calories} kcal per 100g`);

  // Low sodium
  const lowSodium = sodium > 0 ? sodium <= THRESHOLDS.LOW_SODIUM_MAX : true;

  // Gluten-free: null if no ingredient data, false if wheat detected
  let glutenFree: boolean | null = null;
  if (allergens.source === 'ingredients') {
    glutenFree = !hasGluten;
    if (!glutenFree) notes.push('Contains gluten/wheat');
  }

  // Dairy-free
  let dairyFree: boolean | null = null;
  if (allergens.source === 'ingredients') {
    dairyFree = !hasDairy;
    if (!dairyFree) notes.push('Contains dairy');
  }

  // Vegan / Vegetarian — best effort from category + allergens
  let vegan: boolean | null = null;
  let vegetarian: boolean | null = null;

  if (hasMeat || hasFish) {
    vegan = false;
    vegetarian = hasFish ? false : false;
    notes.push('Contains meat or fish');
  } else if (allergens.source === 'ingredients') {
    vegan = !hasAnimalProduct;
    vegetarian = !hasMeat && !hasFish;
    if (!vegan) notes.push('Contains animal products');
  }

  return {
    keto,
    lowCarb,
    highProtein,
    lowFat,
    lowCalorie,
    lowSodium,
    glutenFree,
    dairyFree,
    vegan,
    vegetarian,
    notes,
  };
}

// Valid diet type names accepted by the diet search endpoint
export const VALID_DIET_TYPES = [
  'keto', 'low-carb', 'high-protein', 'low-fat',
  'low-calorie', 'low-sodium', 'gluten-free', 'dairy-free',
  'vegan', 'vegetarian',
] as const;

export type DietType = typeof VALID_DIET_TYPES[number];

export function foodMatchesDiet(food: USDAFood, dietType: DietType): boolean {
  const compat = checkDietCompatibility(food);
  switch (dietType) {
    case 'keto':         return compat.keto;
    case 'low-carb':    return compat.lowCarb;
    case 'high-protein': return compat.highProtein;
    case 'low-fat':     return compat.lowFat;
    case 'low-calorie': return compat.lowCalorie;
    case 'low-sodium':  return compat.lowSodium;
    case 'gluten-free': return compat.glutenFree === true;
    case 'dairy-free':  return compat.dairyFree === true;
    case 'vegan':       return compat.vegan === true;
    case 'vegetarian':  return compat.vegetarian === true;
    default:            return false;
  }
}
