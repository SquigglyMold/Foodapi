export interface USDASearchResponse {
  foods: USDAFood[];
  totalHits: number;
  currentPage: number;
  totalPages: number;
}

export interface USDAFood {
  fdcId: number;
  description: string;
  dataType: string;
  gtinUpc?: string;
  publishedDate: string;
  brandOwner?: string;
  brandName?: string;
  ingredients?: string;
  marketCountry?: string;
  foodCategory?: {
    id: number;
    code: string;
    description: string;
  };
  foodNutrients?: FoodNutrient[];
  foodComponents?: FoodComponent[];
  foodAttributes?: FoodAttribute[];
  foodPortions?: FoodPortion[];
}

export interface FoodNutrient {
  nutrientId: number;
  nutrientName: string;
  nutrientNumber: string;
  unitName: string;
  value: number;
  derivationCode?: string;
  derivationDescription?: string;
}

export interface FoodComponent {
  id: number;
  name: string;
  dataPoints: number;
  gramWeight: number;
  isRefuse: boolean;
  minYearAcquired: number;
  percentWater: number;
  fatNleaFactor: number;
  proteinNleaFactor: number;
  carbohydrateNleaFactor: number;
}

export interface FoodAttribute {
  id: number;
  sequenceNumber: number;
  value: string;
  foodAttributeType: {
    id: number;
    name: string;
    description: string;
  };
}

export interface FoodPortion {
  id: number;
  amount: number;
  dataPoints: number;
  gramWeight: number;
  minYearAcquired: number;
  modifier: string;
  portionDescription: string;
  sequenceNumber: number;
  measureUnit: {
    id: number;
    name: string;
    abbreviation: string;
  };
}

export interface SearchParams {
  type: string;
  pageSize?: number;
  pageNumber?: number;
}

export interface EnhancedSearchParams extends SearchParams {
  dataType?: string;
  brand?: string;
  minCalories?: number;
  maxCalories?: number;
  sortBy?: 'calories' | 'protein' | 'fat' | 'carbohydrates' | 'fiber' | 'sugar' | 'relevance';
  sortOrder?: 'asc' | 'desc';
}

export interface APIResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  requestId?: string;
  details?: any;
}

export interface ExtractedNutritionData {
  fdcId: number;
  description: string;
  brandName?: string;
  servingSize: {
    amount: number;
    unit: string;
  };
  calories: number;
  macronutrients: {
    protein: number;
    carbohydrates: number;
    fat: number;
    fiber?: number;
    sugar?: number;
  };
  dataType: string;
  publishedDate: string;
}

export interface NutritionSearchResult {
  foods: ExtractedNutritionData[];
  totalHits: number;
  currentPage: number;
  totalPages: number;
  searchQuery: string;
}

// ─── Full Nutrition Panel ────────────────────────────────────────────────────

export interface NutrientWithDV {
  value: number;
  unit: string;
  dailyValuePercent?: number;
}

export interface FullNutritionData {
  fdcId: number;
  description: string;
  brandName?: string;
  dataType: string;
  publishedDate: string;
  ingredients?: string;
  foodCategory?: string;
  servingSize: {
    amount: number;
    unit: string;
    gramWeight?: number;
  };
  calories: NutrientWithDV;
  macros: {
    protein: NutrientWithDV;
    carbohydrates: NutrientWithDV;
    fat: NutrientWithDV;
    fiber?: NutrientWithDV;
    sugars?: NutrientWithDV;
    sodium?: NutrientWithDV;
  };
  fatsBreakdown: {
    saturatedFat?: NutrientWithDV;
    transFat?: number;
    monounsaturatedFat?: number;
    polyunsaturatedFat?: number;
    cholesterol?: NutrientWithDV;
  };
  vitamins: {
    vitaminA?: NutrientWithDV;
    vitaminC?: NutrientWithDV;
    vitaminD?: NutrientWithDV;
    vitaminE?: NutrientWithDV;
    vitaminK?: NutrientWithDV;
    thiamin?: NutrientWithDV;
    riboflavin?: NutrientWithDV;
    niacin?: NutrientWithDV;
    vitaminB6?: NutrientWithDV;
    folate?: NutrientWithDV;
    vitaminB12?: NutrientWithDV;
    choline?: NutrientWithDV;
  };
  minerals: {
    calcium?: NutrientWithDV;
    iron?: NutrientWithDV;
    magnesium?: NutrientWithDV;
    phosphorus?: NutrientWithDV;
    potassium?: NutrientWithDV;
    zinc?: NutrientWithDV;
    copper?: NutrientWithDV;
    manganese?: NutrientWithDV;
    selenium?: NutrientWithDV;
  };
}

// ─── Allergen Detection ──────────────────────────────────────────────────────

export interface AllergenInfo {
  detected: string[];
  free: string[];
  source: 'ingredients' | 'unavailable';
  rawIngredients?: string;
}

// ─── Diet Compatibility ──────────────────────────────────────────────────────

export interface DietCompatibility {
  keto: boolean;
  lowCarb: boolean;
  highProtein: boolean;
  lowFat: boolean;
  lowCalorie: boolean;
  lowSodium: boolean;
  glutenFree: boolean | null;
  dairyFree: boolean | null;
  vegan: boolean | null;
  vegetarian: boolean | null;
  notes: string[];
}

// ─── Health Score ────────────────────────────────────────────────────────────

export interface HealthScore {
  score: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  label: string;
  breakdown: {
    positives: ScoreFactor[];
    negatives: ScoreFactor[];
  };
  basedOn: string;
}

export interface ScoreFactor {
  factor: string;
  impact: number;
  description: string;
}

// ─── Meal Calculator ─────────────────────────────────────────────────────────

export interface MealItem {
  fdcId: number;
  grams: number;
  label?: string;
}

export interface MealCalculatorResult {
  totalCalories: number;
  totalWeightGrams: number;
  macros: {
    protein: { grams: number; calories: number; percent: number };
    carbohydrates: { grams: number; calories: number; percent: number };
    fat: { grams: number; calories: number; percent: number };
    fiber?: number;
    sugar?: number;
  };
  dailyValuePercents: {
    calories: number;
    protein: number;
    carbohydrates: number;
    fat: number;
    fiber?: number;
  };
  items: MealItemResult[];
}

export interface MealItemResult {
  fdcId: number;
  label: string;
  grams: number;
  calories: number;
  protein: number;
  carbohydrates: number;
  fat: number;
  fiber?: number;
  error?: string;
}

// ─── Barcode Lookup ──────────────────────────────────────────────────────────

export interface BarcodeProduct {
  barcode: string;
  source: 'openfoodfacts' | 'not_found';
  name?: string;
  brand?: string;
  quantity?: string;
  imageUrl?: string;
  nutriscore?: string;
  ingredients?: string;
  allergens?: string[];
  categories?: string[];
  nutrition?: {
    calories?: number;
    protein?: number;
    carbohydrates?: number;
    fat?: number;
    fiber?: number;
    sugars?: number;
    sodium?: number;
    servingSize?: string;
  };
}

// ─── Food Comparison ─────────────────────────────────────────────────────────

export interface FoodComparisonItem {
  fdcId: number;
  description: string;
  brandName?: string;
  dataType: string;
  calories: number;
  protein: number;
  carbohydrates: number;
  fat: number;
  fiber?: number;
  sugar?: number;
  sodium?: number;
}

export interface ComparisonResult {
  foods: FoodComparisonItem[];
  insights: {
    highestCalories: { fdcId: number; description: string; value: number };
    lowestCalories: { fdcId: number; description: string; value: number };
    highestProtein: { fdcId: number; description: string; value: number };
    lowestFat: { fdcId: number; description: string; value: number };
    highestFiber: { fdcId: number; description: string; value: number };
  };
}

// ─── Autocomplete ────────────────────────────────────────────────────────────

export interface AutoSuggestItem {
  fdcId: number;
  description: string;
  brandName?: string;
  dataType: string;
}

export interface AutoSuggestResult {
  suggestions: AutoSuggestItem[];
  query: string;
  total: number;
}

// ─── Top Foods by Nutrient ───────────────────────────────────────────────────

export interface TopFoodItem extends ExtractedNutritionData {
  nutrientValue: number;
  nutrientUnit: string;
}

export interface TopFoodsResult {
  nutrient: string;
  unit: string;
  sortOrder: 'asc' | 'desc';
  searchQuery?: string;
  foods: TopFoodItem[];
}

// ─── Diet Search ─────────────────────────────────────────────────────────────

export interface DietFoodItem extends ExtractedNutritionData {
  dietInfo: Partial<DietCompatibility>;
}

export interface DietSearchResult {
  dietType: string;
  searchQuery: string;
  foods: DietFoodItem[];
  totalMatched: number;
  totalSearched: number;
  currentPage: number;
  totalPages: number;
}
