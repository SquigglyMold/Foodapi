import { USDAFood, FullNutritionData, NutrientWithDV } from '../types';

// USDA FDC nutrient IDs
const NID = {
  CALORIES: 1008,
  PROTEIN: 1003,
  CARBOHYDRATES: 1005,
  FAT: 1004,
  FIBER: 1079,
  SUGARS: 2000,
  SODIUM: 1093,
  SATURATED_FAT: 1258,
  TRANS_FAT: 1257,
  MONOUNSATURATED_FAT: 1292,
  POLYUNSATURATED_FAT: 1293,
  CHOLESTEROL: 1253,
  VITAMIN_A: 1106,
  VITAMIN_C: 1162,
  VITAMIN_D: 1114,
  VITAMIN_E: 1109,
  VITAMIN_K: 1185,
  THIAMIN: 1165,
  RIBOFLAVIN: 1166,
  NIACIN: 1167,
  VITAMIN_B6: 1175,
  FOLATE: 1177,
  VITAMIN_B12: 1178,
  CHOLINE: 1180,
  CALCIUM: 1087,
  IRON: 1089,
  MAGNESIUM: 1090,
  PHOSPHORUS: 1091,
  POTASSIUM: 1092,
  ZINC: 1095,
  COPPER: 1098,
  MANGANESE: 1101,
  SELENIUM: 1103,
};

// FDA 2020 Daily Values
const DV: Record<string, { value: number; unit: string }> = {
  CALORIES:        { value: 2000,  unit: 'kcal' },
  PROTEIN:         { value: 50,    unit: 'g'    },
  CARBOHYDRATES:   { value: 275,   unit: 'g'    },
  FAT:             { value: 78,    unit: 'g'    },
  FIBER:           { value: 28,    unit: 'g'    },
  SUGARS:          { value: 50,    unit: 'g'    },
  SODIUM:          { value: 2300,  unit: 'mg'   },
  SATURATED_FAT:   { value: 20,    unit: 'g'    },
  CHOLESTEROL:     { value: 300,   unit: 'mg'   },
  VITAMIN_A:       { value: 900,   unit: 'mcg'  },
  VITAMIN_C:       { value: 90,    unit: 'mg'   },
  VITAMIN_D:       { value: 20,    unit: 'mcg'  },
  VITAMIN_E:       { value: 15,    unit: 'mg'   },
  VITAMIN_K:       { value: 120,   unit: 'mcg'  },
  THIAMIN:         { value: 1.2,   unit: 'mg'   },
  RIBOFLAVIN:      { value: 1.3,   unit: 'mg'   },
  NIACIN:          { value: 16,    unit: 'mg'   },
  VITAMIN_B6:      { value: 1.7,   unit: 'mg'   },
  FOLATE:          { value: 400,   unit: 'mcg'  },
  VITAMIN_B12:     { value: 2.4,   unit: 'mcg'  },
  CHOLINE:         { value: 550,   unit: 'mg'   },
  CALCIUM:         { value: 1300,  unit: 'mg'   },
  IRON:            { value: 18,    unit: 'mg'   },
  MAGNESIUM:       { value: 420,   unit: 'mg'   },
  PHOSPHORUS:      { value: 1250,  unit: 'mg'   },
  POTASSIUM:       { value: 4700,  unit: 'mg'   },
  ZINC:            { value: 11,    unit: 'mg'   },
  COPPER:          { value: 0.9,   unit: 'mg'   },
  MANGANESE:       { value: 2.3,   unit: 'mg'   },
  SELENIUM:        { value: 55,    unit: 'mcg'  },
};

function getNutrient(food: USDAFood, nutrientId: number): number {
  if (!food.foodNutrients) return 0;
  const n = food.foodNutrients.find(n => n.nutrientId === nutrientId);
  if (!n || n.value === undefined || n.value === null) return 0;
  const v = parseFloat(n.value.toString());
  return isNaN(v) || v < 0 ? 0 : v;
}

function withDV(value: number, dvKey: string): NutrientWithDV | undefined {
  if (value === 0) return undefined;
  const dvEntry = DV[dvKey];
  const result: NutrientWithDV = { value: round(value), unit: dvEntry.unit };
  if (dvEntry.value > 0) {
    result.dailyValuePercent = round((value / dvEntry.value) * 100);
  }
  return result;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

export function extractFullNutrition(food: USDAFood): FullNutritionData {
  const calories = getNutrient(food, NID.CALORIES);
  const protein = getNutrient(food, NID.PROTEIN);
  const carbs = getNutrient(food, NID.CARBOHYDRATES);
  const fat = getNutrient(food, NID.FAT);
  const fiber = getNutrient(food, NID.FIBER);
  const sugars = getNutrient(food, NID.SUGARS);
  const sodium = getNutrient(food, NID.SODIUM);
  const satFat = getNutrient(food, NID.SATURATED_FAT);
  const transFat = getNutrient(food, NID.TRANS_FAT);
  const mufa = getNutrient(food, NID.MONOUNSATURATED_FAT);
  const pufa = getNutrient(food, NID.POLYUNSATURATED_FAT);
  const cholesterol = getNutrient(food, NID.CHOLESTEROL);

  const servingSize = extractServingSize(food);
  const brand = food.brandOwner || food.brandName;
  const category = food.foodCategory?.description;
  const ingredients = food.ingredients;

  return {
    fdcId: food.fdcId,
    description: (food.description || '').trim().replace(/\s+/g, ' ').substring(0, 200),
    brandName: brand?.trim(),
    dataType: food.dataType,
    publishedDate: food.publishedDate,
    ingredients,
    foodCategory: category,
    servingSize,
    calories: {
      value: round(calories),
      unit: 'kcal',
      dailyValuePercent: round((calories / DV.CALORIES.value) * 100),
    },
    macros: {
      protein: withDV(protein, 'PROTEIN') ?? { value: 0, unit: 'g' },
      carbohydrates: withDV(carbs, 'CARBOHYDRATES') ?? { value: 0, unit: 'g' },
      fat: withDV(fat, 'FAT') ?? { value: 0, unit: 'g' },
      ...(fiber > 0 && { fiber: withDV(fiber, 'FIBER') }),
      ...(sugars > 0 && { sugars: withDV(sugars, 'SUGARS') }),
      ...(sodium > 0 && { sodium: withDV(sodium, 'SODIUM') }),
    },
    fatsBreakdown: {
      ...(satFat > 0 && { saturatedFat: withDV(satFat, 'SATURATED_FAT') }),
      ...(transFat > 0 && { transFat: round(transFat) }),
      ...(mufa > 0 && { monounsaturatedFat: round(mufa) }),
      ...(pufa > 0 && { polyunsaturatedFat: round(pufa) }),
      ...(cholesterol > 0 && { cholesterol: withDV(cholesterol, 'CHOLESTEROL') }),
    },
    vitamins: {
      ...(getNutrient(food, NID.VITAMIN_A) > 0   && { vitaminA:   withDV(getNutrient(food, NID.VITAMIN_A),   'VITAMIN_A')   }),
      ...(getNutrient(food, NID.VITAMIN_C) > 0   && { vitaminC:   withDV(getNutrient(food, NID.VITAMIN_C),   'VITAMIN_C')   }),
      ...(getNutrient(food, NID.VITAMIN_D) > 0   && { vitaminD:   withDV(getNutrient(food, NID.VITAMIN_D),   'VITAMIN_D')   }),
      ...(getNutrient(food, NID.VITAMIN_E) > 0   && { vitaminE:   withDV(getNutrient(food, NID.VITAMIN_E),   'VITAMIN_E')   }),
      ...(getNutrient(food, NID.VITAMIN_K) > 0   && { vitaminK:   withDV(getNutrient(food, NID.VITAMIN_K),   'VITAMIN_K')   }),
      ...(getNutrient(food, NID.THIAMIN) > 0     && { thiamin:    withDV(getNutrient(food, NID.THIAMIN),     'THIAMIN')     }),
      ...(getNutrient(food, NID.RIBOFLAVIN) > 0  && { riboflavin: withDV(getNutrient(food, NID.RIBOFLAVIN),  'RIBOFLAVIN')  }),
      ...(getNutrient(food, NID.NIACIN) > 0      && { niacin:     withDV(getNutrient(food, NID.NIACIN),      'NIACIN')      }),
      ...(getNutrient(food, NID.VITAMIN_B6) > 0  && { vitaminB6:  withDV(getNutrient(food, NID.VITAMIN_B6),  'VITAMIN_B6')  }),
      ...(getNutrient(food, NID.FOLATE) > 0      && { folate:     withDV(getNutrient(food, NID.FOLATE),      'FOLATE')      }),
      ...(getNutrient(food, NID.VITAMIN_B12) > 0 && { vitaminB12: withDV(getNutrient(food, NID.VITAMIN_B12), 'VITAMIN_B12') }),
      ...(getNutrient(food, NID.CHOLINE) > 0     && { choline:    withDV(getNutrient(food, NID.CHOLINE),     'CHOLINE')     }),
    },
    minerals: {
      ...(getNutrient(food, NID.CALCIUM) > 0    && { calcium:    withDV(getNutrient(food, NID.CALCIUM),    'CALCIUM')    }),
      ...(getNutrient(food, NID.IRON) > 0       && { iron:       withDV(getNutrient(food, NID.IRON),       'IRON')       }),
      ...(getNutrient(food, NID.MAGNESIUM) > 0  && { magnesium:  withDV(getNutrient(food, NID.MAGNESIUM),  'MAGNESIUM')  }),
      ...(getNutrient(food, NID.PHOSPHORUS) > 0 && { phosphorus: withDV(getNutrient(food, NID.PHOSPHORUS), 'PHOSPHORUS') }),
      ...(getNutrient(food, NID.POTASSIUM) > 0  && { potassium:  withDV(getNutrient(food, NID.POTASSIUM),  'POTASSIUM')  }),
      ...(getNutrient(food, NID.ZINC) > 0       && { zinc:       withDV(getNutrient(food, NID.ZINC),       'ZINC')       }),
      ...(getNutrient(food, NID.COPPER) > 0     && { copper:     withDV(getNutrient(food, NID.COPPER),     'COPPER')     }),
      ...(getNutrient(food, NID.MANGANESE) > 0  && { manganese:  withDV(getNutrient(food, NID.MANGANESE),  'MANGANESE')  }),
      ...(getNutrient(food, NID.SELENIUM) > 0   && { selenium:   withDV(getNutrient(food, NID.SELENIUM),   'SELENIUM')   }),
    },
  };
}

function extractServingSize(food: USDAFood): { amount: number; unit: string; gramWeight?: number } {
  if (food.foodPortions && food.foodPortions.length > 0) {
    const p = food.foodPortions[0];
    if (p.amount && p.measureUnit) {
      return {
        amount: p.amount,
        unit: p.measureUnit.abbreviation || p.measureUnit.name || 'serving',
        gramWeight: p.gramWeight,
      };
    }
  }
  return { amount: 100, unit: 'g' };
}
