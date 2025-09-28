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
    protein: number; // grams
    carbohydrates: number; // grams
    fat: number; // grams
    fiber?: number; // grams
    sugar?: number; // grams
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
