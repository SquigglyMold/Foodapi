import { USDAFood, HealthScore, ScoreFactor } from '../types';

// Nutrient IDs used for scoring
const NID = {
  CALORIES:      1008,
  PROTEIN:       1003,
  FIBER:         1079,
  SATURATED_FAT: 1258,
  SODIUM:        1093,
  SUGAR:         2000,
  VITAMIN_C:     1162,
  VITAMIN_A:     1106,
  VITAMIN_D:     1114,
  CALCIUM:       1087,
  IRON:          1089,
  POTASSIUM:     1092,
};

function get(food: USDAFood, id: number): number {
  if (!food.foodNutrients) return 0;
  const n = food.foodNutrients.find(n => n.nutrientId === id);
  if (!n || n.value == null) return 0;
  const v = parseFloat(n.value.toString());
  return isNaN(v) || v < 0 ? 0 : v;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

export function calculateHealthScore(food: USDAFood): HealthScore {
  const calories   = get(food, NID.CALORIES);
  const protein    = get(food, NID.PROTEIN);
  const fiber      = get(food, NID.FIBER);
  const satFat     = get(food, NID.SATURATED_FAT);
  const sodium     = get(food, NID.SODIUM);
  const sugar      = get(food, NID.SUGAR);
  const vitaminC   = get(food, NID.VITAMIN_C);
  const vitaminA   = get(food, NID.VITAMIN_A);
  const vitaminD   = get(food, NID.VITAMIN_D);
  const calcium    = get(food, NID.CALCIUM);
  const iron       = get(food, NID.IRON);
  const potassium  = get(food, NID.POTASSIUM);

  const positives: ScoreFactor[] = [];
  const negatives: ScoreFactor[] = [];

  // ── Nutrients to encourage ───────────────────────────────────────────────

  // Protein (per 100g): >25g = +12, >15g = +8, >8g = +5, >3g = +2
  const proteinScore = protein >= 25 ? 12 : protein >= 15 ? 8 : protein >= 8 ? 5 : protein >= 3 ? 2 : 0;
  if (proteinScore > 0) {
    positives.push({ factor: 'Protein', impact: proteinScore, description: `${protein}g protein per 100g` });
  }

  // Fiber (per 100g): >7g = +12, >4g = +8, >2g = +5, >0.5g = +2
  const fiberScore = fiber >= 7 ? 12 : fiber >= 4 ? 8 : fiber >= 2 ? 5 : fiber >= 0.5 ? 2 : 0;
  if (fiberScore > 0) {
    positives.push({ factor: 'Fiber', impact: fiberScore, description: `${fiber}g fiber per 100g` });
  }

  // Vitamin C (% DV based on 90mg): >50% = +5, >20% = +3, >5% = +1
  const vitCPct = (vitaminC / 90) * 100;
  const vitCScore = vitCPct >= 50 ? 5 : vitCPct >= 20 ? 3 : vitCPct >= 5 ? 1 : 0;
  if (vitCScore > 0) {
    positives.push({ factor: 'Vitamin C', impact: vitCScore, description: `${Math.round(vitCPct)}% DV` });
  }

  // Vitamin A (% DV based on 900mcg): >50% = +4, >20% = +2, >5% = +1
  const vitAPct = (vitaminA / 900) * 100;
  const vitAScore = vitAPct >= 50 ? 4 : vitAPct >= 20 ? 2 : vitAPct >= 5 ? 1 : 0;
  if (vitAScore > 0) {
    positives.push({ factor: 'Vitamin A', impact: vitAScore, description: `${Math.round(vitAPct)}% DV` });
  }

  // Vitamin D (% DV based on 20mcg): >50% = +4, >20% = +2, >5% = +1
  const vitDPct = (vitaminD / 20) * 100;
  const vitDScore = vitDPct >= 50 ? 4 : vitDPct >= 20 ? 2 : vitDPct >= 5 ? 1 : 0;
  if (vitDScore > 0) {
    positives.push({ factor: 'Vitamin D', impact: vitDScore, description: `${Math.round(vitDPct)}% DV` });
  }

  // Calcium (% DV based on 1300mg): >30% = +4, >15% = +2, >5% = +1
  const calciumPct = (calcium / 1300) * 100;
  const calciumScore = calciumPct >= 30 ? 4 : calciumPct >= 15 ? 2 : calciumPct >= 5 ? 1 : 0;
  if (calciumScore > 0) {
    positives.push({ factor: 'Calcium', impact: calciumScore, description: `${Math.round(calciumPct)}% DV` });
  }

  // Iron (% DV based on 18mg): >30% = +4, >15% = +2, >5% = +1
  const ironPct = (iron / 18) * 100;
  const ironScore = ironPct >= 30 ? 4 : ironPct >= 15 ? 2 : ironPct >= 5 ? 1 : 0;
  if (ironScore > 0) {
    positives.push({ factor: 'Iron', impact: ironScore, description: `${Math.round(ironPct)}% DV` });
  }

  // Potassium (% DV based on 4700mg): >20% = +3, >10% = +2, >5% = +1
  const potPct = (potassium / 4700) * 100;
  const potScore = potPct >= 20 ? 3 : potPct >= 10 ? 2 : potPct >= 5 ? 1 : 0;
  if (potScore > 0) {
    positives.push({ factor: 'Potassium', impact: potScore, description: `${Math.round(potPct)}% DV` });
  }

  // ── Nutrients to limit ──────────────────────────────────────────────────

  // Saturated fat (per 100g): >15g = -12, >10g = -8, >5g = -4, >2g = -2
  const satFatPenalty = satFat >= 15 ? 12 : satFat >= 10 ? 8 : satFat >= 5 ? 4 : satFat >= 2 ? 2 : 0;
  if (satFatPenalty > 0) {
    negatives.push({ factor: 'Saturated Fat', impact: -satFatPenalty, description: `${satFat}g per 100g` });
  }

  // Sodium (per 100g): >900mg = -12, >600mg = -8, >300mg = -4, >140mg = -2
  const sodiumPenalty = sodium >= 900 ? 12 : sodium >= 600 ? 8 : sodium >= 300 ? 4 : sodium >= 140 ? 2 : 0;
  if (sodiumPenalty > 0) {
    negatives.push({ factor: 'Sodium', impact: -sodiumPenalty, description: `${sodium}mg per 100g` });
  }

  // Sugar (per 100g): >45g = -12, >22.5g = -8, >9g = -4, >4.5g = -2
  const sugarPenalty = sugar >= 45 ? 12 : sugar >= 22.5 ? 8 : sugar >= 9 ? 4 : sugar >= 4.5 ? 2 : 0;
  if (sugarPenalty > 0) {
    negatives.push({ factor: 'Sugar', impact: -sugarPenalty, description: `${sugar}g per 100g` });
  }

  // Calorie density (per 100g): >400 = -8, >300 = -5, >200 = -2
  const caloriePenalty = calories >= 400 ? 8 : calories >= 300 ? 5 : calories >= 200 ? 2 : 0;
  if (caloriePenalty > 0) {
    negatives.push({ factor: 'Calorie Density', impact: -caloriePenalty, description: `${calories} kcal per 100g` });
  }

  // ── Final score ────────────────────────────────────────────────────────

  const positiveTotal = positives.reduce((s, f) => s + f.impact, 0);
  const negativeTotal = Math.abs(negatives.reduce((s, f) => s + f.impact, 0));
  const raw = 50 + positiveTotal - negativeTotal;
  const score = clamp(Math.round(raw), 0, 100);

  const grade = score >= 80 ? 'A' : score >= 65 ? 'B' : score >= 50 ? 'C' : score >= 35 ? 'D' : 'F';
  const label = score >= 80 ? 'Excellent'
    : score >= 65 ? 'Good'
    : score >= 50 ? 'Fair'
    : score >= 35 ? 'Poor'
    : 'Very Poor';

  return {
    score,
    grade,
    label,
    breakdown: { positives, negatives },
    basedOn: 'Nutrient density per 100g (protein, fiber, vitamins, minerals vs saturated fat, sodium, sugar, calorie density)',
  };
}
