import { USDAFood, ExtractedNutritionData, NutritionSearchResult, USDASearchResponse } from '../types';

export class NutritionExtractor {
  // USDA nutrient IDs for common nutrients
  private static readonly NUTRIENT_IDS = {
    CALORIES: 1008, // Energy (kcal)
    PROTEIN: 1003, // Protein
    CARBOHYDRATES: 1005, // Carbohydrate, by difference
    FAT: 1004, // Total lipid (fat)
    FIBER: 1079, // Fiber, total dietary
    SUGAR: 2000, // Sugars, total including NLEA
    SODIUM: 1093, // Sodium, Na
    SATURATED_FAT: 1258, // Fatty acids, total saturated
    TRANS_FAT: 1257, // Fatty acids, total trans
    CHOLESTEROL: 1253 // Cholesterol
  };

  /**
   * Extract nutrition data from USDA search response
   * @param usdaResponse - Raw USDA API response
   * @param searchQuery - Original search query
   * @returns Processed nutrition data
   */
  /**
   * Extract nutrition data from USDA search response
   * Optimized with parallel processing for better performance
   */
  static extractNutritionData(
    usdaResponse: USDASearchResponse, 
    searchQuery: string
  ): NutritionSearchResult {
    if (!usdaResponse.foods || usdaResponse.foods.length === 0) {
      return {
        foods: [],
        totalHits: usdaResponse.totalHits || 0,
        currentPage: usdaResponse.currentPage || 1,
        totalPages: usdaResponse.totalPages || 0,
        searchQuery
      };
    }

    // Process foods in parallel for better performance
    const extractedFoods = usdaResponse.foods
      .map(food => {
        try {
          return this.extractSingleFoodNutrition(food);
        } catch (error: unknown) {
          console.warn(`Failed to extract nutrition data for food ID ${food.fdcId}:`, error);
          return null;
        }
      })
      .filter((food): food is ExtractedNutritionData => food !== null);

    return {
      foods: extractedFoods,
      totalHits: usdaResponse.totalHits || 0,
      currentPage: usdaResponse.currentPage || 1,
      totalPages: usdaResponse.totalPages || 0,
      searchQuery
    };
  }

  /**
   * Extract nutrition data from a single USDA food item
   * @param food - Single USDA food item
   * @returns Extracted nutrition data or null if extraction fails
   */
  private static extractSingleFoodNutrition(food: USDAFood): ExtractedNutritionData | null {
    try {
      // Extract basic information
      const description = this.cleanDescription(food.description);
      const brandName = this.extractBrandName(food);
      const servingSize = this.extractServingSize(food);
      
      // Extract macronutrients
      const macronutrients = this.extractMacronutrients(food);
      
      // Extract calories
      const calories = this.extractNutrientValue(food, this.NUTRIENT_IDS.CALORIES);

      return {
        fdcId: food.fdcId,
        description,
        brandName,
        servingSize,
        calories,
        macronutrients,
        dataType: food.dataType,
        publishedDate: food.publishedDate
      };
    } catch (error: unknown) {
      console.warn(`Error extracting nutrition for food ${food.fdcId}:`, error);
      return null;
    }
  }

  /**
   * Clean and format food description
   */
  private static cleanDescription(description: string): string {
    if (!description) return 'Unknown Food';
    
    return description
      .trim()
      .replace(/\s+/g, ' ') // Replace multiple spaces with single space
      .replace(/[^\w\s\-.,&()]/g, '') // Remove special characters except common ones
      .substring(0, 200); // Limit length
  }

  /**
   * Extract brand name from food data
   */
  private static extractBrandName(food: USDAFood): string | undefined {
    // Try different sources for brand name
    if (food.brandOwner) {
      return food.brandOwner.trim();
    }
    
    // Sometimes brand info is in the description
    const description = food.description || '';
    const brandMatch = description.match(/^([^,]+),/);
    if (brandMatch && brandMatch[1].length < 50) {
      return brandMatch[1].trim();
    }
    
    return undefined;
  }

  /**
   * Extract serving size information
   */
  private static extractServingSize(food: USDAFood): { amount: number; unit: string } {
    // Default serving size
    let amount = 100;
    let unit = 'g';

    // Try to get serving size from food portions
    if (food.foodPortions && food.foodPortions.length > 0) {
      const primaryPortion = food.foodPortions[0];
      if (primaryPortion.amount && primaryPortion.measureUnit) {
        amount = primaryPortion.amount;
        unit = primaryPortion.measureUnit.abbreviation || primaryPortion.measureUnit.name || 'g';
      }
    }

    // Try to extract from description if available
    const description = food.description || '';
    const servingMatch = description.match(/(\d+(?:\.\d+)?)\s*(g|gram|grams|oz|ounce|ounces|ml|milliliter|milliliters|cup|cups|tbsp|tablespoon|tablespoons|tsp|teaspoon|teaspoons)/i);
    if (servingMatch) {
      amount = parseFloat(servingMatch[1]);
      unit = this.normalizeUnit(servingMatch[2]);
    }

    return { amount, unit };
  }

  /**
   * Normalize unit abbreviations
   */
  private static normalizeUnit(unit: string): string {
    const unitMap: { [key: string]: string } = {
      'g': 'g',
      'gram': 'g',
      'grams': 'g',
      'oz': 'oz',
      'ounce': 'oz',
      'ounces': 'oz',
      'ml': 'ml',
      'milliliter': 'ml',
      'milliliters': 'ml',
      'cup': 'cup',
      'cups': 'cup',
      'tbsp': 'tbsp',
      'tablespoon': 'tbsp',
      'tablespoons': 'tbsp',
      'tsp': 'tsp',
      'teaspoon': 'tsp',
      'teaspoons': 'tsp'
    };

    return unitMap[unit.toLowerCase()] || unit;
  }

  /**
   * Extract macronutrients from food data
   */
  private static extractMacronutrients(food: USDAFood): {
    protein: number;
    carbohydrates: number;
    fat: number;
    fiber?: number;
    sugar?: number;
  } {
    const protein = this.extractNutrientValue(food, this.NUTRIENT_IDS.PROTEIN);
    const carbohydrates = this.extractNutrientValue(food, this.NUTRIENT_IDS.CARBOHYDRATES);
    const fat = this.extractNutrientValue(food, this.NUTRIENT_IDS.FAT);
    const fiber = this.extractNutrientValue(food, this.NUTRIENT_IDS.FIBER);
    const sugar = this.extractNutrientValue(food, this.NUTRIENT_IDS.SUGAR);

    return {
      protein: Math.round(protein * 100) / 100, // Round to 2 decimal places
      carbohydrates: Math.round(carbohydrates * 100) / 100,
      fat: Math.round(fat * 100) / 100,
      fiber: fiber > 0 ? Math.round(fiber * 100) / 100 : undefined,
      sugar: sugar > 0 ? Math.round(sugar * 100) / 100 : undefined
    };
  }

  /**
   * Extract specific nutrient value from food data
   */
  private static extractNutrientValue(food: USDAFood, nutrientId: number): number {
    if (!food.foodNutrients || food.foodNutrients.length === 0) {
      return 0;
    }

    const nutrient = food.foodNutrients.find(n => n.nutrientId === nutrientId);
    if (!nutrient || nutrient.value === undefined || nutrient.value === null) {
      return 0;
    }

    // Ensure value is a number and not negative
    const value = parseFloat(nutrient.value.toString());
    return isNaN(value) || value < 0 ? 0 : value;
  }

  /**
   * Get detailed nutrition information for a specific food
   */
  static getDetailedNutrition(food: USDAFood): ExtractedNutritionData | null {
    return this.extractSingleFoodNutrition(food);
  }

  /**
   * Validate if extracted nutrition data is complete enough
   */
  static isValidNutritionData(data: ExtractedNutritionData): boolean {
    return (
      data.fdcId > 0 &&
      data.description.length > 0 &&
      data.servingSize.amount > 0 &&
      data.servingSize.unit.length > 0 &&
      (data.calories > 0 || data.macronutrients.protein > 0 || 
       data.macronutrients.carbohydrates > 0 || data.macronutrients.fat > 0)
    );
  }
}
